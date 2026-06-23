# convert-to-pdf

Convert Word, Excel, PowerPoint, Markdown, and image files to PDF — entirely locally, with no third-party conversion API in the loop.

## What it does

This app accepts document uploads (Word, Excel, PowerPoint, Markdown, images) and converts them to PDF. Conversion runs locally via **LibreOffice** rather than calling out to a third-party conversion service. Jobs are tracked in **Postgres** via **Prisma**, and the actual conversion work happens in a dedicated **background worker process** rather than inside the web request — the app enqueues a job, the worker polls the queue, runs the conversion, and writes the result back. This keeps LibreOffice's CPU-heavy work off the main request path and lets failed jobs be retried with backoff instead of just failing a single HTTP request.

Paid usage is handled through **Razorpay**, with geo-based currency detection so pricing can be shown in a currency appropriate to the visitor.

There's also a small admin dashboard (behind a token-based login) for inspecting queue depth, retry timing, recent failures, and payment state.

## Tech stack

- **Next.js 16** (App Router)
- **Prisma** as the ORM
- **PostgreSQL** for job/queue and payment state storage (Neon Postgres in production, local Postgres via Docker for development)
- **LibreOffice** (via `libreoffice-convert`) for local, dependency-free document conversion
- **Razorpay** for payments, with geo-based currency support

## Quickstart

```bash
git clone <this-repo-url>
cd convert-to-pdf
npm install
cp .env.example .env
```

Fill in the values in `.env` — at minimum a reachable `DATABASE_URL` and an `ADMIN_ACCESS_TOKEN`. See the comments in `.env.example` for what each variable does. If you don't have Razorpay keys yet, set `NEXT_PUBLIC_SKIP_PAYMENT=true` to bypass payment locally.

Apply the database schema:

```bash
npx prisma migrate deploy
```

Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Note: actual file conversion is handled by a separate background worker (`worker/conversion-worker.mjs`), not the Next.js dev server itself. For a one-command setup that brings up the app, the worker, and a local Postgres database together, use the Docker path below.

### Docker

The project ships with a full Docker setup (app container, worker container, local Postgres for development) and `Makefile` shortcuts like `make dev` and `make up`. See [`DOCKER.md`](./DOCKER.md) for the complete guide, including environment variables and production-style runs.

## Deployment

Deployment guides are included for two paths:

- [`deployment.md`](./deployment.md) — DigitalOcean (Droplet + Docker + Neon Postgres + Caddy/Nginx)
- [`deployment-aws.md`](./deployment-aws.md) — AWS (EC2 + Docker + Neon Postgres + Caddy/Nginx)

Both assume the Docker-based setup described in [`DOCKER.md`](./DOCKER.md).

## A note on this codebase

This project runs on a version of Next.js with breaking changes relative to older conventions — for example, `proxy.ts` at the repo root replaces the traditional `middleware.ts`. See [`AGENTS.md`](./AGENTS.md) and [`CONTRIBUTING.md`](./CONTRIBUTING.md) before making changes, and check `node_modules/next/dist/docs/` for this installed version's actual conventions.

## Contributing

Contributions are welcome. Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) for local setup, the branch/PR workflow, and lint expectations, and [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) for community guidelines.

## License

This project is licensed under the [MIT License](./LICENSE).
