# API Reference

This document describes the HTTP endpoints exposed by the Next.js app in this repository. It is generated from the actual route source under `src/app/api/`, `src/proxy.ts`, and the supporting libraries in `src/lib/`.

All JSON responses include a top-level `success: boolean` field. Error responses use `{ success: false, message: "..." }`, sometimes with an additional `error` field containing the underlying error message.

---

## POST /api/convert

Accepts one or more files and queues a conversion job. Conversion itself happens out-of-band in the background worker — this endpoint only validates input, persists the job, and returns immediately.

**Source:** `src/app/api/convert/route.js`

### Auth

None. Access is gated by IP-based rate limiting and the free-tier/payment logic below.

### Rate limit

10 requests per minute per client IP (key: `convert:<sha256(ip)>`). Backed by a DB-persisted counter (`src/lib/rate-limit.js`). Note that `getClientIp` only trusts forwarded-IP headers when `TRUST_PROXY_HEADERS=true`; otherwise every request is treated as IP `127.0.0.1`, which means the rate limit and free-tier-per-IP tracking collapse onto a single bucket.

### Request

`multipart/form-data` body with fields:

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` | file (repeatable) | yes | Append multiple times for multiple files. Max 10 files total. |
| `compress` | string | no | Must be the literal string `"true"` to enable compression; anything else is treated as `false`. |
| `razorpay_order_id` | string | conditionally | Required once the free tier is exhausted (see Payment logic). |
| `razorpay_payment_id` | string | conditionally | Required once the free tier is exhausted. |
| `razorpay_signature` | string | conditionally | Required once the free tier is exhausted; HMAC-SHA256 of `orderId|paymentId` using `RAZORPAY_KEY_SECRET`. |
| `webhookUrl` | string | no | If present, must parse as an `http://` or `https://` URL (400 `"Invalid webhook URL"` otherwise). The worker POSTs a JSON notification to this URL when the job finishes — see [Webhook notifications](#webhook-notifications) below. Note: only scheme/parse validation is performed; there is no SSRF protection (no check against private/internal IP ranges), so treat this as a feature for trusted integrators, not arbitrary public input. |
| `pageNumbers` | string | no | Must be the literal string `"true"` to draw `n / total` page numbers (bottom-center) on every page of the output PDF. |
| `watermarkText` | string | no | If non-empty, drawn diagonally across every page of the output PDF at low opacity. |

**Validation rules (in order applied):**

1. Rate limit check (see above) — 429 if exceeded.
2. Form must parse as `multipart/form-data` — 400 if it doesn't.
3. At least one `file` field — 400 `"Missing files"` if none.
4. At most 10 files — 400 if exceeded.
5. Combined size of all files must be ≤ 50MB (`maxTotalUploadSize`) — 413 if exceeded.
6. Each individual file must be ≤ 10MB (`maxFileSize`, from `src/lib/conversion.mjs`) — 413 if any file exceeds it.
7. Each file's extension (case-insensitive) must be in the allowed set — 400 if not. Allowed extensions (`allowedExtensions` in `src/lib/conversion.mjs`): `.pdf`, `.doc`, `.docx`, `.odt`, `.rtf`, `.txt`, `.md`, `.xls`, `.xlsx`, `.csv`, `.ppt`, `.pptx`, `.png`, `.jpg`, `.jpeg`.

**Free tier / payment logic:**

- Each client IP (hashed) gets exactly one free conversion (`UserUsage.usedFree`), unless `NEXT_PUBLIC_SKIP_PAYMENT=true`, in which case every request is treated as free and usage is never recorded.
- If the free tier is already used and `NEXT_PUBLIC_SKIP_PAYMENT` is not `true`, the request must include valid Razorpay fields:
  - Missing any of `razorpay_order_id` / `razorpay_payment_id` / `razorpay_signature` → 402 `"Free limit reached. Payment required."`
  - Razorpay env vars not configured → throws (caught by outer handler → 500).
  - Signature mismatch (`HMAC-SHA256(orderId|paymentId, RAZORPAY_KEY_SECRET)` recomputed and compared to `razorpay_signature`) → 400 `"Invalid payment signature"`.
  - No matching `ConversionOrder` row for `razorpay_order_id` → 404 `"Unknown payment order"`.
  - Matching order already has `status === 'completed'` → 409 `"Order already used"`.
  - Otherwise the order's status is updated to `paid` and the request proceeds.
- If this is a genuinely free request (first use for this IP, or `NEXT_PUBLIC_SKIP_PAYMENT=true`), and `NEXT_PUBLIC_SKIP_PAYMENT` is not `true`, the `UserUsage` row is upserted with `usedFree: true` so subsequent requests from the same IP require payment.

**On success**, a `ConversionJob` row (status `staging`) plus one `ConversionJobFile` row per file is created, each file's bytes are written to job storage (`writeJobArtifact`), and the job's status is updated to `queued`.

### Response

**202 Accepted** — job queued:

```json
{
  "success": true,
  "message": "Conversion job queued",
  "job": {
    "id": "c1a9c1d0-1234-4abc-9def-abcdef123456",
    "status": "queued",
    "paymentStatus": "not_required",
    "downloadUrl": "/api/jobs/c1a9c1d0-1234-4abc-9def-abcdef123456/download",
    "statusUrl": "/api/jobs/c1a9c1d0-1234-4abc-9def-abcdef123456"
  }
}
```

`paymentStatus` is `"not_required"` for free conversions or `"paid"` once a valid Razorpay payment was verified.

### Errors

| Status | Condition | Example body |
|---|---|---|
| 400 | Form data couldn't be parsed | `{ "success": false, "message": "Invalid form data" }` |
| 400 | No `file` fields present | `{ "success": false, "message": "Missing files" }` |
| 400 | More than 10 files | `{ "success": false, "message": "Too many files. Maximum allowed is 10." }` |
| 400 | Disallowed file extension | `{ "success": false, "message": "Unsupported file type: .exe" }` |
| 400 | Razorpay signature doesn't match | `{ "success": false, "message": "Invalid payment signature" }` |
| 402 | Free tier used and no payment fields supplied | `{ "success": false, "message": "Free limit reached. Payment required." }` |
| 404 | `razorpay_order_id` not found in DB | `{ "success": false, "message": "Unknown payment order" }` |
| 409 | Order already marked `completed` | `{ "success": false, "message": "Order already used" }` |
| 413 | Combined upload exceeds 50MB | `{ "success": false, "message": "Total upload size exceeds the 50MB limit." }` |
| 413 | A single file exceeds 10MB | `{ "success": false, "message": "File too large: report.docx" }` |
| 429 | Rate limit exceeded (10/min/IP) | `{ "success": false, "message": "Too many requests. Please try again later." }` |
| 500 | Any uncaught error (e.g. Razorpay misconfigured, DB error, no valid file content) | `{ "success": false, "message": "Conversion failed", "error": "<error message>" }` |

On a 500 after the job row was already created, the job is marked `failed` with `errorMessage` set, and any written input/output artifacts for that job are deleted.

### Webhook notifications

**Source:** `src/lib/webhook.mjs`, called from `worker/conversion-worker.mjs`.

If `webhookUrl` was supplied, the background worker sends a single `POST` to it once the job reaches a terminal state — `completed`, or `failed` after retries are exhausted (never on an intermediate retry). Delivery is best-effort: a 5-second timeout, and any failure (network error, non-2xx, timeout) is logged and swallowed — it never affects the job's own status. The job's `webhookSentAt` timestamp is set after the delivery attempt, regardless of whether it succeeded.

Request sent to `webhookUrl`:

```
POST <webhookUrl>
Content-Type: application/json
X-Webhook-Signature: <hex HMAC-SHA256, only if WEBHOOK_SIGNING_SECRET is set>
```

Body on success:

```json
{ "jobId": "c1a9c1d0-1234-4abc-9def-abcdef123456", "status": "completed", "downloadUrl": "/api/jobs/c1a9c1d0-1234-4abc-9def-abcdef123456/download" }
```

Body on final failure:

```json
{ "jobId": "c1a9c1d0-1234-4abc-9def-abcdef123456", "status": "failed", "errorMessage": "Unable to convert file: the document is invalid, corrupted, or unsupported." }
```

If `WEBHOOK_SIGNING_SECRET` is set, `X-Webhook-Signature` is `HMAC-SHA256(JSON.stringify(body), WEBHOOK_SIGNING_SECRET)` in hex — verify it by recomputing the same HMAC over the raw request body before trusting the payload.

---

## GET /api/jobs/[id]

Fetches the current state of a conversion job for polling.

**Source:** `src/app/api/jobs/[id]/route.js`

### Auth

None.

### Rate limit

None applied at this route.

### Request

Path parameter:

| Param | Type | Notes |
|---|---|---|
| `id` | string | Must match UUID format `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` (case-insensitive). Non-matching values are treated as not found, not as a 400. |

### Response

**200 OK:**

```json
{
  "success": true,
  "job": {
    "id": "c1a9c1d0-1234-4abc-9def-abcdef123456",
    "status": "completed",
    "compress": false,
    "fileCount": 2,
    "totalSize": 184320,
    "outputSize": 92160,
    "errorMessage": null,
    "razorpayOrderId": null,
    "razorpayPaymentId": null,
    "paymentStatus": "not_required",
    "attempts": 1,
    "nextRetryAt": null,
    "startedAt": "2026-06-24T10:00:01.000Z",
    "finishedAt": "2026-06-24T10:00:05.000Z",
    "createdAt": "2026-06-24T10:00:00.000Z",
    "updatedAt": "2026-06-24T10:00:05.000Z",
    "files": [
      {
        "id": "f1b2c3d4-...",
        "originalName": "report.docx",
        "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "size": 92160,
        "orderIndex": 0,
        "createdAt": "2026-06-24T10:00:00.000Z"
      }
    ],
    "hasOutput": true,
    "downloadUrl": "/api/jobs/c1a9c1d0-1234-4abc-9def-abcdef123456/download"
  }
}
```

Notes on fields:
- `outputKey` (internal storage path) is never returned; it's replaced by the derived `hasOutput` boolean and `downloadUrl`.
- `downloadUrl` is `null` until the job has a stored output (`hasOutput: false`).
- `status` is one of the values written by the convert route and worker: `staging`, `queued`, `processing`, `completed`, `failed` (also `cancelled` per schema comment, though no route in this codebase sets it).

### Errors

| Status | Condition | Example body |
|---|---|---|
| 404 | `id` fails UUID pattern, or no job with that id exists | `{ "success": false, "message": "Job not found" }` |
| 500 | Unexpected DB/query error | `{ "success": false, "message": "Failed to fetch job" }` |

There is no explicit 409 case in this route (409 is documented for the download route below).

---

## GET /api/jobs/[id]/download

Streams the converted PDF for a completed job.

**Source:** `src/app/api/jobs/[id]/download/route.js`

### Auth

None.

### Rate limit

None applied at this route.

### Request

Path parameter:

| Param | Type | Notes |
|---|---|---|
| `id` | string | Same UUID pattern as `/api/jobs/[id]`. Non-matching values are treated as not found. |

### Response

**200 OK** — binary PDF body, with headers:

| Header | Value |
|---|---|
| `Content-Type` | `application/pdf` |
| `Content-Disposition` | `attachment; filename="converted-document.pdf"` |
| `Content-Length` | the job's stored `outputSize`, or the buffer length if `outputSize` is unset |
| `X-Conversion-Job-Id` | the job's `id` |

If `DELETE_JOB_OUTPUT_AFTER_DOWNLOAD=true`, the job's `outputKey` is cleared and the stored output artifact is deleted immediately after being read for this response (i.e. the file is downloadable exactly once).

### Errors

| Status | Condition | Example body |
|---|---|---|
| 404 | `id` fails UUID pattern, or no job with that id exists | `{ "success": false, "message": "Job not found" }` |
| 409 | Job exists but `status !== 'completed'` or it has no `outputKey` yet | `{ "success": false, "message": "Converted PDF is not ready yet" }` |
| 500 | Error reading the stored artifact or other unexpected failure | `{ "success": false, "message": "Failed to download converted PDF" }` |

---

## POST /api/create-order

Creates a Razorpay order for a paid conversion, with currency selected by geo-IP lookup.

**Source:** `src/app/api/create-order/route.js`

### Auth

None.

### Rate limit

5 requests per minute per client IP (key: `create-order:<sha256(ip)>`), same DB-backed limiter as `/api/convert`.

### Request

No request body is read. The route only uses the caller's IP (via `getClientIp`) to decide currency.

### Order creation flow

1. Rate limit check — 429 if exceeded.
2. `requireRazorpayConfig()` — throws if `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` are unset or contain `"placeholder"` (caught by the outer handler → 500).
3. `isUserInIndia(ip)` (geo lookup, `src/lib/geo.js`) determines pricing:
   - India: amount `1000` (paise) = ₹10, currency `INR`.
   - Elsewhere: amount `250` (cents) = $2.50, currency `USD`.
4. Calls `razorpay.orders.create({ amount, currency, receipt: "rcpt_<timestamp>" })`.
5. Persists a `ConversionOrder` row with `status: "created"`, the chosen `amount`, and `currency`.
6. Returns the raw Razorpay order object.

### Response

**200 OK:**

```json
{
  "success": true,
  "order": {
    "id": "order_AbCdEf12345",
    "entity": "order",
    "amount": 1000,
    "currency": "INR",
    "receipt": "rcpt_1771920000000",
    "status": "created",
    "...": "additional fields as returned by the Razorpay SDK"
  }
}
```

### Errors

| Status | Condition | Example body |
|---|---|---|
| 429 | Rate limit exceeded (5/min/IP) | `{ "success": false, "message": "Too many requests. Please try again later." }` |
| 500 | Razorpay not configured, Razorpay API error, or DB error | `{ "success": false, "message": "Failed to create order" }` |

---

## Admin endpoints

All `/admin/*` pages and `/api/admin/*` routes are gated at the edge by `src/proxy.ts` (Next's proxy/middleware equivalent in this version), matched via `config.matcher: ['/admin/:path*', '/api/admin/:path*']`. The proxy logic:

- Lets `/admin/login`, `/api/admin/login`, and `/api/admin/logout` through unconditionally (no auth check).
- For every other `/admin/*` or `/api/admin/*` path, it reads the `convert-to-pdf-admin-session` cookie and validates it with `isAdminCookieValid()` (HMAC-SHA256 signed timestamp, 8 hour TTL, secret = `ADMIN_ACCESS_TOKEN`/`ADMIN_METRICS_TOKEN`).
- If the cookie is missing/invalid: `/api/admin/*` requests get a `401 { success: false, message: "Admin authentication required" }` JSON response; `/admin/*` page requests are redirected to `/admin/login`.
- If the cookie is valid, the request passes through to the actual route handler.

Because the proxy already rejects unauthenticated requests to `/api/admin/*` before they reach the route handlers, the cookie is the de facto required credential for all admin API routes in the current proxy configuration, including `/api/admin/metrics` (see below for its additional, currently-unreachable-without-a-cookie header-token check).

### POST /api/admin/login

Exchanges the static admin token for a signed session cookie.

**Source:** `src/app/api/admin/login/route.js`. Passed through by the proxy without a cookie check.

**Auth:** none required to call it; the body must contain the correct token.

**Rate limit:** none applied at this route.

**Request:** JSON body:

```json
{ "token": "the-admin-access-token" }
```

`token` is compared (constant-time) against `ADMIN_ACCESS_TOKEN` (or its legacy alias `ADMIN_METRICS_TOKEN`) via `isAdminTokenValid()`.

**Response:**

- **200 OK** on success, and sets the `convert-to-pdf-admin-session` cookie (`httpOnly`, `sameSite=strict`, `secure` in production, `path=/`, `maxAge=8h`):

  ```json
  { "success": true, "message": "Admin session created" }
  ```

**Errors:**

| Status | Condition | Example body |
|---|---|---|
| 401 | Token missing/incorrect | `{ "success": false, "message": "Invalid admin token" }` |
| 503 | No admin token configured at all (`ADMIN_ACCESS_TOKEN`/`ADMIN_METRICS_TOKEN` unset), so no cookie can be signed | `{ "success": false, "message": "Admin access is not configured" }` |
| 500 | Unexpected error (e.g. malformed request) | `{ "success": false, "message": "Failed to authenticate admin", "error": "<error message>" }` |

### POST /api/admin/logout

Clears the admin session cookie.

**Source:** `src/app/api/admin/logout/route.js`. Passed through by the proxy without a cookie check.

**Auth:** none required to call it (it just clears whatever cookie is present, if any).

**Rate limit:** none.

**Request:** no body.

**Response:**

- **200 OK** always:

  ```json
  { "success": true, "message": "Admin session cleared" }
  ```

  Sets `convert-to-pdf-admin-session` to an empty value with `maxAge: 0`.

**Errors:** none — this handler has no failure path.

### GET /api/admin/metrics

Returns queue depth, retry timing, payment counts, and recent job activity for the admin dashboard.

**Source:** `src/app/api/admin/metrics/route.js`. Gated by the proxy (cookie required) as described above.

**Auth:** Enforced twice:
1. By `src/proxy.ts` — requires the valid `convert-to-pdf-admin-session` cookie before the request reaches this handler.
2. By the handler itself, which independently accepts **either**:
   - a valid `convert-to-pdf-admin-session` cookie (`isAdminCookieValid`), **or**
   - a header token via `x-admin-metrics-token` or `Authorization: Bearer <token>`, validated against `ADMIN_ACCESS_TOKEN`/`ADMIN_METRICS_TOKEN` (`isAdminTokenValid`).

   Given the proxy already blocks cookie-less requests to any `/api/admin/*` path (including this one), the header-token branch in the handler is currently unreachable from outside — a request without the cookie never reaches this code. It would only matter if the proxy's matcher were changed or removed.

**Rate limit:** none applied at this route.

**Request:** no body; no params.

**Response:**

- **200 OK:**

  ```json
  {
    "success": true,
    "generatedAt": "2026-06-24T10:00:00.000Z",
    "queue": {
      "queued": 3,
      "processing": 1,
      "retrying": 1,
      "failed": 2,
      "completed": 120,
      "queuedLagSeconds": 12,
      "retryWaitSeconds": 30,
      "oldestQueuedJob": { "id": "...", "createdAt": "...", "nextRetryAt": null },
      "oldestRetryingJob": { "id": "...", "createdAt": "...", "nextRetryAt": "..." }
    },
    "payments": {
      "pending": 0,
      "paid": 45,
      "notRequired": 75
    },
    "recent": {
      "latestFailedJob": { "id": "...", "errorMessage": "...", "attempts": 3, "finishedAt": "...", "createdAt": "..." },
      "latestCompletedJob": { "id": "...", "finishedAt": "...", "createdAt": "...", "fileCount": 2, "totalSize": 184320 }
    }
  }
  ```

  `retrying` counts jobs with `status: 'queued'` and `nextRetryAt` in the future. `queuedLagSeconds` is how long the oldest queued job has been waiting; `retryWaitSeconds` is how long until the oldest retrying job's next attempt.

**Errors:**

| Status | Condition | Example body |
|---|---|---|
| 401 | (From proxy) no/invalid session cookie | `{ "success": false, "message": "Admin authentication required" }` |
| 401 | (From handler, only reachable if proxy is bypassed) neither cookie nor header token valid | `{ "success": false, "message": "Unauthorized metrics request" }` |
| 500 | DB query error | `{ "success": false, "message": "Failed to fetch metrics", "error": "<error message>" }` |

---

## GET /api/worker-health

Proxies a health check to the background conversion worker process, for use by uptime monitoring or the admin dashboard.

**Source:** `src/app/api/worker-health/route.js`

### Auth

None.

### Rate limit

None applied at this route.

### Request

No params, no body.

### Behavior

- Reads `CONVERSION_WORKER_URL` from the environment. If unset, returns **503** immediately without making any outbound request.
- Otherwise fetches `GET <CONVERSION_WORKER_URL>/health` with `cache: 'no-store'` and relays the worker's JSON body.

### Response

**200 OK** — worker responded with an ok status:

```json
{
  "success": true,
  "workerUrl": "http://worker:8080/health",
  "worker": { "status": "ok", "...": "whatever the worker's /health returns" }
}
```

### Errors

| Status | Condition | Example body |
|---|---|---|
| 503 | `CONVERSION_WORKER_URL` not set | `{ "success": false, "status": "not-configured", "message": "CONVERSION_WORKER_URL is missing" }` |
| 503 | Worker responded with a non-ok HTTP status | `{ "success": false, "workerUrl": "http://worker:8080/health", "worker": { "...": "worker's body" } }` |
| 503 | Request to the worker failed (network error, timeout, etc.) | `{ "success": false, "workerUrl": "http://worker:8080/health", "message": "Worker health check failed", "error": "<error message>" }` |
