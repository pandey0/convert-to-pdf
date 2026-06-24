# Architecture — convert-to-pdf

A Next.js 16 (App Router) service that converts uploaded documents/images into a single merged PDF, backed by a Postgres-queued background worker running LibreOffice. Includes Razorpay-based metered payments (one free conversion per IP, then paid) and a token-protected admin dashboard for queue health.

> Note on Next.js version: this repo runs Next.js 16, which renamed the `middleware.ts` convention to `proxy.ts`. The file must still live next to the `app/` directory — i.e. at `src/proxy.ts` in this project, since routes live under `src/app/`. See `node_modules/next/dist/docs/` before changing routing/middleware behavior.

---

## 1. Overview

```
                       ┌─────────────────────────┐
   Browser  ───────▶   │   app (Next.js 16)      │
                       │   port 3000             │
                       └───────────┬─────────────┘
                                   │ Prisma (SQL)
                                   ▼
                       ┌─────────────────────────┐
                       │   db (Postgres 16)       │
                       │   ConversionJob queue +  │
                       │   rate limits, usage,    │
                       │   orders                 │
                       └───────────┬─────────────┘
                                   │ poll every
                                   │ CONVERSION_WORKER_POLL_INTERVAL_MS
                                   ▼
                       ┌─────────────────────────┐
                       │   worker (Node process)  │
                       │   conversion-worker.mjs   │
                       │   LibreOffice + pdf-lib   │
                       └───────────┬─────────────┘
                                   │
                     shared Docker volume "job_storage"
                     (JOB_STORAGE_ROOT, default /data/job-artifacts)
                                   ▲
                       ┌───────────┴─────────────┐
                       │   app writes inputs /    │
                       │   reads outputs here too │
                       └─────────────────────────┘
```

The **app** and **worker** never talk to each other over HTTP for the main conversion flow — they communicate entirely through two shared resources: the `ConversionJob` table in Postgres (the queue) and the `job_storage` Docker volume (the file payloads). The worker does expose a legacy HTTP `/convert` + `/health` endpoint, but it's effectively vestigial now (see §3).

---

## 2. Components

| Component | What it is | Entry point | Port |
|---|---|---|---|
| `app` | Next.js 16 App Router app — UI + all `/api/*` routes | `src/app/`, started via `npm start` (prod) / `npm run dev` (dev) | 3000 |
| `worker` | Standalone long-running Node process, not part of the Next.js build | `worker/conversion-worker.mjs`, started via `node worker/conversion-worker.mjs` | 4000 (`CONVERSION_WORKER_PORT`) |
| `db` | Postgres 16 | Docker image `postgres:16-alpine` (dev only — prod typically points `DATABASE_URL` at Neon) | 5432 |
| `job_storage` (volume) | Shared Docker volume mounted at `/data` in both `app` and `worker` | n/a | n/a |

Both `app` and `worker` are built from the **same** `Dockerfile` (Node 20 on Debian bullseye, with LibreOffice and Chromium/Puppeteer runtime libs installed via `apt-get`); only the container `command` differs. This keeps the LibreOffice binary and `node_modules` identical between the two, which matters because `conversion.mjs` (the conversion logic) is shared code imported by both the API route's synchronous fallback path and the worker.

### The worker's legacy HTTP endpoint

`worker/conversion-worker.mjs` also runs an `http` server with:
- `GET /health` — used by the Docker healthcheck (`docker-compose.yml`) and by `src/app/api/worker-health/route.js`, which the app exposes for external monitoring of worker liveness.
- `POST /convert` — token-gated via `x-conversion-worker-token` header (must equal `CONVERSION_WORKER_TOKEN`), accepts a JSON payload of files and synchronously returns a converted PDF.

This `/convert` endpoint is **not used by the main conversion flow** — `/api/convert` does not call it. It appears to be a holdover from an earlier synchronous design and is kept mainly for the `/health` check and potential direct/manual invocation.

---

## 3. Data Model

Schema source: `prisma/schema.prisma`. Five models:

| Model | Purpose | Key fields |
|---|---|---|
| `ConversionJob` | The conversion queue / job record | `id` (uuid), `ipHash`, `status` (`queued`\|`processing`\|`completed`\|`failed`, plus a transient `staging` value used only during job creation — see §4), `compress`, `fileCount`, `totalSize`, `outputKey`, `outputSize`, `errorMessage`, `razorpayOrderId` (unique), `razorpayPaymentId`, `paymentStatus` (`pending`\|`paid`\|`failed`\|`not_required`), `attempts`, `nextRetryAt`, `startedAt`, `finishedAt`, timestamps |
| `ConversionJobFile` | One row per uploaded file in a job | `id`, `jobId` (FK, cascade delete), `originalName`, `mimeType`, `size`, `storageKey` (absolute path into the shared volume), `orderIndex` |
| `ConversionOrder` | Razorpay order tracking | `id`, `razorpayOrderId` (unique), `status` (`created`\|`paid`\|`completed`\|`failed`), `amount` (smallest currency unit), `currency` (`INR`/`USD`) |
| `UserUsage` | One free conversion per hashed IP | `id`, `ipHash` (unique), `usedFree` |
| `RateLimitCounter` | DB-backed sliding-window rate limiting | `id`, `key` (unique, e.g. `convert:<ipHash>`), `count`, `resetAt` |

Indexes on `ConversionJob`: `ipHash`, `status`, `paymentStatus`, `nextRetryAt` — all driven by the worker's poll query and the admin metrics aggregation.

`ConversionJobFile.jobId` has `onDelete: Cascade`, so deleting a `ConversionJob` row removes its file rows automatically (the app doesn't currently delete job rows in normal operation, only the on-disk artifacts).

---

## 4. Request Flows

### 4.1 Conversion flow (happy path)

```
Browser                  app (/api/convert)              db                    worker                 job_storage
  │  POST multipart           │                           │                       │                       │
  │  field "file" (repeat)    │                           │                       │                       │
  ├──────────────────────────▶│                           │                       │                       │
  │                           │ rate-limit check (10/min) │                       │                       │
  │                           ├──────────────────────────▶│                       │                       │
  │                           │ validate count/size/ext   │                       │                       │
  │                           │ (BEFORE any DB row)        │                       │                       │
  │                           │ free-tier or Razorpay check│                       │                       │
  │                           │ create ConversionJob       │                       │                       │
  │                           │   status: "staging"        │                       │                       │
  │                           ├──────────────────────────▶│                       │                       │
  │                           │ write each file to disk    │                       │                       │
  │                           ├─────────────────────────────────────────────────────────────────────────▶│
  │                           │ update status -> "queued"  │                       │                       │
  │                           ├──────────────────────────▶│                       │                       │
  │  202 {job:{id,statusUrl,  │                           │                       │                       │
  │        downloadUrl}}      │                           │                       │                       │
  │◀──────────────────────────┤                           │                       │                       │
  │                           │                           │  poll every 5s        │                       │
  │                           │                           │◀──────────────────────┤                       │
  │                           │                           │  atomic claim         │                       │
  │                           │                           │  (updateMany WHERE    │                       │
  │                           │                           │   status='queued')    │                       │
  │                           │                           │  -> status="processing"                       │
  │                           │                           │◀──────────────────────┤                       │
  │                           │                           │                       │ read input artifacts │
  │                           │                           │                       ├──────────────────────▶│
  │                           │                           │                       │ convertFilesToPdfBuffer│
  │                           │                           │                       │ (LibreOffice / pdf-lib)│
  │                           │                           │                       │ write output PDF      │
  │                           │                           │                       ├──────────────────────▶│
  │                           │                           │  status="completed"   │                       │
  │                           │                           │◀──────────────────────┤                       │
  │                           │                           │                       │ delete input artifacts│
  │                           │                           │                       ├──────────────────────▶│
  │  GET /api/jobs/:id  (poll loop, ~1.5s interval)        │                       │                       │
  ├──────────────────────────▶│──────────────────────────▶│                       │                       │
  │  {job:{status:"completed",downloadUrl}}                │                       │                       │
  │◀──────────────────────────┤                           │                       │                       │
  │  GET /api/jobs/:id/download                            │                       │                       │
  ├──────────────────────────▶│ stream PDF from disk      │                       │                       │
  │  200 application/pdf      │                           │                       │                       │
  │◀──────────────────────────┤                           │                       │                       │
```

Step-by-step (source: `src/app/api/convert/route.js`, `src/lib/job-storage.mjs`, `src/lib/conversion.mjs`, `worker/conversion-worker.mjs`):

1. **Browser** POSTs multipart form data to `POST /api/convert` — field name `file`, repeated once per file (up to 10), plus optional `compress`, and Razorpay fields (`razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`) if payment was required.
2. **Rate limiting**: `rateLimit('convert:<ipHash>', 10, 60000)` — 10 requests/minute per hashed IP, backed by `RateLimitCounter` (see `src/lib/rate-limit.js`).
3. **Validation, before any DB row is created**: file count ≤ 10, total upload size ≤ 50MB, per-file size ≤ 10MB (`maxFileSize` in `src/lib/conversion.mjs`), extension allowlist (`allowedExtensions`: `.pdf .doc .docx .odt .rtf .txt .md .xls .xlsx .csv .ppt .pptx .png .jpg .jpeg`). This ordering matters — validating before job creation avoids creating orphaned `ConversionJob`/`ConversionJobFile` rows for requests that are ultimately rejected.
4. **Payment / free-tier gate**: one free conversion per hashed IP via `UserUsage.usedFree`; if already used, requires Razorpay `orderId` + `paymentId` + `signature`, verified by recomputing an HMAC‑SHA256 of `orderId|paymentId` with `RAZORPAY_KEY_SECRET` and comparing to the supplied `signature`. The associated `ConversionOrder` must exist and not already be `completed`. Entirely bypassed when `NEXT_PUBLIC_SKIP_PAYMENT=true` (dev default).
5. **Job creation**: a `ConversionJob` row is created with `status: "staging"` plus its child `ConversionJobFile` rows (no `storageKey` yet). Files are then written to disk one at a time via `writeJobArtifact(jobId, orderIndex, originalName, buffer)`, which sanitizes the filename (`sanitizeSegment` in `src/lib/job-storage.mjs`, strips to `[a-zA-Z0-9._-]`) and writes to `JOB_STORAGE_ROOT/<jobId>/inputs/<2-digit-index>-<uuid>-<sanitizedName>`. Each file's `storageKey` is then updated on its `ConversionJobFile` row.
6. Once all files are written, the job's `status` flips from `staging` to `queued` — this is the signal the worker polls for.
7. The route responds `202` with `{ success, job: { id, status: "queued", paymentStatus, downloadUrl, statusUrl } }`.
8. **Worker poll loop** (`processQueuedJobs`, ticking every `CONVERSION_WORKER_POLL_INTERVAL_MS`, default 5000ms): `claimNextQueuedJob()` finds the oldest job with `status: 'queued'` AND (`nextRetryAt` is null OR in the past), then **atomically claims** it via `updateMany({ where: { id, status: 'queued' }, data: { status: 'processing', ... } })` — the `status: 'queued'` guard in the `WHERE` clause prevents double-claiming if multiple worker replicas ever run concurrently (currently the topology runs a single worker, but this makes the design safe to scale out).
9. **Conversion** (`convertFilesToPdfBuffer` in `src/lib/conversion.mjs`):
   - Images (`.png`, `.jpg`, `.jpeg`) are embedded directly as full-page images via `pdf-lib` (`embedPng`/`embedJpg`).
   - `.md` files are rendered to HTML via `marked`, then converted to PDF via `libreoffice-convert`. **LibreOffice HTML-import bug workaround**: LibreOffice's HTML importer drops the first block element's content and replaces it with a blank page when more content follows. The fix prepends a throwaway leading paragraph (`<p>&nbsp;</p>`) before the real Markdown-rendered HTML, which absorbs the bug's effect; the resulting blank first page is then sliced off (`pageIndices.slice(1)`) before merging into the final document.
   - All other supported office formats (`.doc`, `.docx`, `.odt`, `.rtf`, `.txt`, `.xls`, `.xlsx`, `.csv`, `.ppt`, `.pptx`) go through `libreoffice-convert` directly.
   - Every per-file PDF (including pass-through `.pdf` inputs) is merged page-by-page into one accumulating `pdf-lib` `PDFDocument` (`copyPages`/`addPage`), preserving upload order (`orderIndex`). The final buffer is saved with `useObjectStreams: compress` when the `compress` flag was set.
10. **On success**: output written via `writeJobOutputArtifact(jobId, buffer)` to `JOB_STORAGE_ROOT/<jobId>/output/converted-document.pdf`; job updated to `status: "completed"`, `outputKey`, `outputSize`, `finishedAt`; linked `ConversionOrder` (if any) marked `completed`; input artifacts deleted (`deleteJobInputs`).
11. **On failure**: caught in the poll loop. If `attempts < CONVERSION_WORKER_MAX_ATTEMPTS` (default 3), the job is requeued (`status: 'queued'`) with `nextRetryAt` set to now + exponential backoff (`CONVERSION_WORKER_RETRY_BASE_DELAY_MS * 2^(attempts-1)`, default base 5000ms → 5s, 10s, 20s...). Otherwise the job is marked `failed` permanently and its input artifacts are deleted. In both cases the stored `errorMessage` is **sanitized** — only a fixed allowlist of safe, user-facing prefixes (`Unsupported file type:`, `File too large:`, `Missing files`, etc.) is passed through verbatim; anything else (e.g. raw LibreOffice/Java stderr, which can leak internal paths or infra details) is replaced with a generic `"Unable to convert file: the document is invalid, corrupted, or unsupported."` message.
12. **Browser polling**: the UI (`src/app/page.js`) polls `GET /api/jobs/:id` every ~1.5s. The route validates that `:id` matches a UUID regex *before* querying the DB (avoids malformed-input DB errors leaking internals), returns job status/metadata, and a `downloadUrl` once `outputKey` is set.
13. **Download**: `GET /api/jobs/:id/download` re-validates UUID format, requires `status === 'completed'` and a non-null `outputKey`, streams the PDF from disk with `Content-Type: application/pdf`. If `DELETE_JOB_OUTPUT_AFTER_DOWNLOAD=true`, the output artifact and `outputKey` are cleared immediately after the first successful download (one-time download semantics).

### 4.2 Payment flow

```
Browser                          app (/api/create-order)      Razorpay              db
  │  POST /api/create-order            │                          │                 │
  ├────────────────────────────────────▶│ rate-limit (5/min)       │                 │
  │                                     │ geo-IP lookup (ipapi.co) │                 │
  │                                     │ -> India: ₹10 / else: $2.50│              │
  │                                     │ create order ────────────▶│                │
  │                                     │◀───────────────────────────┤                │
  │                                     │ save ConversionOrder ─────────────────────▶│
  │  {order:{id,amount,currency}}      │                          │                 │
  │◀────────────────────────────────────┤                          │                 │
  │  open Razorpay checkout widget                                                    │
  │  (user pays)                                                                       │
  │  handler receives {order_id,payment_id,signature}                                  │
  │  -> calls performConversion() -> POST /api/convert with those fields               │
```

- `POST /api/create-order` (`src/app/api/create-order/route.js`): rate-limited 5/min per IP; geo-IP via `isUserInIndia` (`src/lib/geo.js`, calls `https://ipapi.co/<ip>/json/`, defaults to "India" — i.e. the cheaper price — on lookup failure or for localhost); price is ₹10 (1000 paise) for India, $2.50 (250 cents) otherwise; creates a Razorpay order and a matching `ConversionOrder` row (`status: 'created'`).
- The frontend opens the Razorpay Checkout widget client-side using `NEXT_PUBLIC_RAZORPAY_KEY_ID`; on success, the returned `razorpay_order_id` / `razorpay_payment_id` / `razorpay_signature` are forwarded to `/api/convert`, which independently re-verifies the HMAC signature server-side (never trusts the client-reported "payment succeeded" state alone).
- `requireRazorpayConfig()` (`src/lib/razorpay.js`) guards against running with placeholder/missing `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`.
- Entirely short-circuited in development: `NEXT_PUBLIC_SKIP_PAYMENT=true` makes every conversion free regardless of prior usage.

### 4.3 Admin auth + dashboard flow

```
Browser                    proxy.ts (src/proxy.ts)        /api/admin/login        /api/admin/metrics
  │ GET /admin                  │                              │                       │
  ├─────────────────────────────▶│ no session cookie            │                       │
  │                              │ -> redirect /admin/login     │                       │
  │◀─────────────────────────────┤                              │                       │
  │ POST {token} ─────────────────────────────────────────────▶│ isAdminTokenValid()    │
  │                              │                              │ (timingSafeEqual vs    │
  │                              │                              │  ADMIN_ACCESS_TOKEN)   │
  │                              │                              │ set signed cookie      │
  │                              │                              │ (HMAC-SHA256, 8h TTL)  │
  │◀────────────────────────────────────────────────────────────┤                       │
  │ GET /admin (with cookie)    │                              │                       │
  ├─────────────────────────────▶│ isAdminCookieValid() -> OK   │                       │
  │                              │ -> next()                    │                       │
  │ GET /api/admin/metrics ──────────────────────────────────────────────────────────────▶│
  │ (polled every 15s)           │                              │  cookie OR             │
  │                              │                              │  x-admin-metrics-token │
  │                              │                              │  OR Bearer header      │
  │◀──────────────────────────────────────────────────────────────────────────────────────┤
```

- `src/proxy.ts` is the Next.js 16 equivalent of `middleware.ts` (renamed convention; must live beside `app/`, i.e. inside `src/` for this project's `src/app/` layout). It exports a `proxy(request)` function (not `middleware`) plus a `config.matcher: ['/admin/:path*', '/api/admin/:path*']`.
- It allow-lists `/admin/login`, `/api/admin/login`, `/api/admin/logout` (unauthenticated by design), and for every other matched path checks the `convert-to-pdf-admin-session` cookie via `isAdminCookieValid` (`src/lib/admin-auth.js`). Unauthenticated page requests get a redirect to `/admin/login`; unauthenticated API requests get a JSON `401`.
- **Session cookie**: `value = "<timestampMs>.<hmacSha256Hex>"`, signed with secret `ADMIN_ACCESS_TOKEN` (or legacy alias `ADMIN_METRICS_TOKEN`). Validity requires the signature to verify (via `crypto.timingSafeEqual`) and `Date.now() - timestamp <= 8h`. Set as `httpOnly`, `sameSite: strict`, `secure` in production, `maxAge: 8h`.
- `POST /api/admin/login` checks the submitted token against `isAdminTokenValid` (also `timingSafeEqual`, length-checked first to avoid throwing on mismatched lengths) and, on success, issues the session cookie.
- `POST /api/admin/logout` clears the cookie (`maxAge: 0`).
- `GET /api/admin/metrics` additionally accepts the raw token via `x-admin-metrics-token` header or `Authorization: Bearer <token>` — this lets scripts/monitoring tools query metrics without going through the cookie/login flow. It returns queue counts by status (`queued`, `processing`, `retrying` = queued-with-future-`nextRetryAt`, `failed`, `completed`), payment status counts, oldest-queued/oldest-retrying lag in seconds, and the most recent failed/completed job summaries.
- The admin UI (`src/app/admin/page.js`) polls `/api/admin/metrics` every 15 seconds and redirects to `/admin/login` on a `401`.

---

## 5. Security Model

| Area | Mechanism | Notes / honest limitations |
|---|---|---|
| Rate limiting | DB-backed (`RateLimitCounter`), keyed by route + hashed IP (`convert`: 10/min, `create-order`: 5/min) | **Only IP-keyed if `TRUST_PROXY_HEADERS=true`.** By default `getClientIp()` (`src/lib/request.js`) returns a hardcoded `127.0.0.1` for every request, meaning rate limiting (and the free-tier-per-IP logic) effectively treats *all* traffic as a single client unless explicitly configured to trust `cf-connecting-ip` / `x-real-ip` / `x-forwarded-for`. This must be enabled — and only when the app is genuinely behind a trusted reverse proxy that sets these headers — in any real deployment. |
| Job access control | None beyond unguessability | Job IDs are UUIDv4, and there is **no per-user/session ownership check** on `GET /api/jobs/:id` or its `/download`. Anyone who learns or guesses a job ID can poll its status and download its output. Mitigated only by UUIDs being practically unguessable; not a substitute for real authorization if this is a concern for your deployment. |
| Input validation on job lookups | UUID-format regex check before any DB query, on both `/api/jobs/:id` and `/api/jobs/:id/download` | Prevents malformed IDs from reaching Prisma/Postgres and leaking driver-level error internals; returns a uniform `404` instead. |
| File name handling | `sanitizeSegment()` (`src/lib/job-storage.mjs`) strips all but `[a-zA-Z0-9._-]`, trims leading/trailing underscores, caps at 120 chars, falls back to `"file"` | Applied before any user-supplied filename touches the filesystem (both inputs and the output filename). |
| Conversion error surface | `sanitizeErrorMessage()` allowlist in `worker/conversion-worker.mjs` | Raw LibreOffice/Java stderr (which can include internal file paths, library versions, etc.) is never returned to the API/browser — only a small set of known-safe, pre-validation error strings pass through verbatim; everything else collapses to a generic message. |
| Admin authentication | HMAC-SHA256-signed session cookie (`ADMIN_ACCESS_TOKEN` secret, 8h TTL) + raw-token header/Bearer alternative for `/api/admin/metrics` | Both the token comparison (`isAdminTokenValid`) and the cookie signature comparison (`isAdminCookieValid`) use `crypto.timingSafeEqual` to resist timing attacks, with an explicit length check first (since `timingSafeEqual` throws on mismatched buffer lengths rather than returning false). |
| Admin route gating | `src/proxy.ts` — must live at `src/proxy.ts` (next to `src/app/`) | A real bug fixed in this codebase's history: the file previously sat at the repo root, where Next.js silently never loaded it, leaving every `/admin/*` and `/api/admin/*` route completely unauthenticated. Verify this file's location any time you upgrade Next.js or restructure `src/`. |
| Payment integrity | Server-side HMAC-SHA256 re-verification of Razorpay `order_id|payment_id` against `signature`, using `RAZORPAY_KEY_SECRET` | The client-reported "payment succeeded" callback is never trusted on its own; `/api/convert` independently recomputes and compares the signature, and checks the `ConversionOrder` hasn't already been consumed (`status === 'completed'` rejected). |
| Job creation ordering | All validation (file count/size/extension) happens before any `ConversionJob`/`ConversionJobFile` row is created | Prevents orphaned DB rows for requests that fail validation. |

---

## 6. Deployment Topology

| File | Purpose |
|---|---|
| `Dockerfile` | Single image (Node 20 on Debian bullseye) used by both `app` and `worker`; installs LibreOffice + headless-Chromium runtime libs, runs `npm install`, `npx prisma generate`, `npm run build`. Container `CMD` runs `npx prisma migrate deploy && npm start`. |
| `docker-compose.yml` | Production-like topology: `app` (built from `Dockerfile`, default command, depends on `worker` being healthy, port 3000 published) + `worker` (`command: node worker/conversion-worker.mjs`, with a Docker healthcheck hitting `/health`). Both share the `job_storage` named volume at `/data`. No `db` service — expects `DATABASE_URL` to point at an external Postgres (e.g. Neon) via the env file. |
| `docker-compose.dev.yml` | Override file for local development: adds a local `db` Postgres 16 service (with healthcheck), bind-mounts the repo into both `app` and `worker` for live reload, runs `app` via `sh -c "npx prisma migrate deploy && npm run dev -- --hostname 0.0.0.0"`, and overrides `worker`'s volumes the same way. `app` now depends on `db` being healthy instead of `worker`. |
| `Makefile` | Wraps common compose invocations: `make up`/`make down` (prod compose only), `make dev`/`make dev-down` (prod + dev override combined). **`make down` does not stop the dev-only `db` container** — `make dev-down` is required for that, since it's the only target that includes `docker-compose.dev.yml` in its teardown. |
| `deployment.md` | DigitalOcean Droplet deployment guide (Ubuntu 22.04, Docker install, firewall rules, Neon Postgres, reverse proxy). |
| `deployment-aws.md` | AWS EC2 equivalent deployment guide (same Docker + Neon + reverse-proxy pattern). |
| `DOCKER.md` | General Docker usage notes for this repo. |

Both `app` and `worker` mount the same named volume `job_storage` at `/data` — this is the *only* channel through which uploaded inputs and converted outputs move between the two processes; there is no file transfer over HTTP in the main flow.

---

## 7. Environment Variables

Source: `.env.example`.

| Variable | Default / example | Used by | Purpose |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@db:5432/convert_to_pdf?schema=public` | app, worker (via Prisma) | Postgres connection string. Dev compose override points this at the local `db` service; prod points at Neon or another managed Postgres. |
| `CONVERSION_WORKER_URL` | `http://worker:4000/convert` | app (`/api/worker-health`) | Base URL used to derive the worker's `/health` endpoint for monitoring. Not used for the main queue-driven flow. |
| `CONVERSION_WORKER_TOKEN` | `local-worker-token` | worker | Shared secret required in `x-conversion-worker-token` header to call the legacy `POST /convert` HTTP endpoint. |
| `CONVERSION_WORKER_POLL_INTERVAL_MS` | `5000` | worker | How often the worker polls Postgres for queued jobs. |
| `CONVERSION_WORKER_MAX_ATTEMPTS` | `3` | worker | Max processing attempts before a job is marked permanently `failed`. |
| `CONVERSION_WORKER_RETRY_BASE_DELAY_MS` | `5000` | worker | Base delay for exponential backoff between retries (doubles each attempt). |
| `CONVERSION_WORKER_PORT` | `4000` | worker | Port the worker's legacy HTTP server listens on. |
| `JOB_STORAGE_ROOT` | `/data/job-artifacts` | app, worker | Root directory (inside the shared volume) for job input/output artifacts. |
| `DELETE_JOB_OUTPUT_AFTER_DOWNLOAD` | `false` | app | If `true`, deletes the converted PDF from disk and clears `outputKey` immediately after the first successful download. |
| `ADMIN_ACCESS_TOKEN` | *(must be set)* | app | Secret used both to validate the raw admin token at login and to sign/verify the admin session cookie. |
| `ADMIN_METRICS_TOKEN` | *(legacy alias)* | app | Falls back to this if `ADMIN_ACCESS_TOKEN` is unset (see `getAdminAccessToken()` in `src/lib/admin-auth.js`). |
| `RAZORPAY_KEY_ID` | `rzp_test_YOUR_KEY_HERE` | app | Razorpay API key ID. |
| `RAZORPAY_KEY_SECRET` | `YOUR_SECRET_HERE` | app | Razorpay API secret; also used as the HMAC key for payment-signature verification. |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | `rzp_test_YOUR_KEY_HERE` | browser (build-time inlined) | Public Razorpay key used to open the client-side Checkout widget; must match `RAZORPAY_KEY_ID`. |
| `NEXT_PUBLIC_SKIP_PAYMENT` | `true` | app, browser | When `true`, every conversion is treated as free — bypasses both the free-tier-usage tracking and the Razorpay payment requirement. Intended for development only. |
| `TRUST_PROXY_HEADERS` | `false` | app | When `true`, `getClientIp()` trusts `cf-connecting-ip` / `x-real-ip` / `x-forwarded-for` headers; otherwise every request is treated as `127.0.0.1`. Only set `true` behind a trusted reverse proxy that sets these headers itself. |

---

## 8. Known Limitations

These are real, intentional-tradeoff limitations of the current design — not hidden bugs:

1. **Rate limiting / free-tier tracking collapses to a single bucket without `TRUST_PROXY_HEADERS=true`.** Out of the box, `getClientIp()` returns `127.0.0.1` for every request, so the per-IP rate limit and the "one free conversion per IP" logic both treat the entire userbase as one client. In production behind a reverse proxy that sets `X-Forwarded-For`/`X-Real-IP`/`CF-Connecting-IP`, this flag must be turned on — and only then, since trusting these headers from an untrusted source allows IP-spoofing.
2. **No per-user/session ownership on jobs.** `ConversionJob` IDs are UUIDs with no owner field and no auth check on read. Anyone who obtains a job ID (e.g. via browser history, a referrer leak, or by brute-force-guessing — practically infeasible given UUIDv4 entropy, but not cryptographically prevented) can check status and download the resulting PDF. This is an accepted tradeoff for a no-login, anonymous-upload product; it would need to change if multi-tenant isolation or stricter privacy guarantees become a requirement.
3. **Geo-IP pricing depends on a third-party service (`ipapi.co`)** with no caching or fallback provider; on failure (or for localhost) it defaults to treating the user as being in India, i.e. the cheaper price tier — a fail-open choice that favors user experience over revenue.
4. **Single worker process, no horizontal scaling configured.** The atomic `updateMany` claim in `claimNextQueuedJob()` is *designed* to be safe with multiple worker replicas, but the current Docker Compose topology only runs one `worker` container; there's no auto-scaling or multi-instance orchestration wired up yet.
5. **The worker's legacy `/convert` HTTP endpoint is effectively dead code in the current flow.** It still runs, is still token-gated, and is still covered by the Docker healthcheck (via `/health`), but nothing in the app calls `/convert` directly anymore — the entire conversion pipeline is DB-queue-driven. It represents maintenance surface (and a token to manage) without being load-bearing.
6. **LibreOffice HTML-import workaround is a targeted hack, not a permanent fix.** The leading-blank-paragraph workaround in `convertFilesToPdfBuffer` (see `src/lib/conversion.mjs`) compensates for a specific observed LibreOffice behavior (dropping the first block element's content when followed by more content). It is not guaranteed to hold across all LibreOffice versions/locales, and should be re-verified if the base Docker image's LibreOffice version changes.
7. **No retry/backoff ceiling beyond `CONVERSION_WORKER_MAX_ATTEMPTS`, and failed jobs are not automatically purged.** `failed` jobs (and their `ConversionJobFile` rows) persist indefinitely unless manually cleaned up; only their on-disk input artifacts are deleted.
