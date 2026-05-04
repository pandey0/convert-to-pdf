# Docker Guide

This project is set up with Docker in two layers:

- `Dockerfile` builds the app image
- `docker-compose.yml` runs the production-like container
- `docker-compose.dev.yml` overrides that setup for live reload during development and starts a local Postgres database
- a separate `worker` container handles document conversion
- the worker also polls Postgres for queued conversion jobs and processes them in the background
- `Makefile` wraps the common commands so you do not need to remember long compose commands

## What Each File Does

### `Dockerfile`
The image installs the OS packages needed by the app, then:

1. copies `package*.json`
2. runs `npm install`
3. copies the app source
4. runs `npx prisma generate`
5. runs `npm run build`
6. starts the app with `npx prisma migrate deploy && npm start`

That means the image is a built app, not a live-edit dev image.

The same image is also reused by the conversion worker container, which runs `worker/conversion-worker.mjs` instead of Next.js.

### `docker-compose.yml`
This is the default runtime setup:

- builds from `Dockerfile`
- starts both the app and the worker containers
- exposes port `3000`
- loads variables from the env file named by `APP_ENV_FILE` and defaults to `.env`
- uses `restart: unless-stopped`

Use this when you want a production-like run.

### `docker-compose.dev.yml`
This file adds the development override:

- replaces the container command with `npx prisma migrate deploy && npm run dev -- --hostname 0.0.0.0`
- starts a local Postgres container named `db`
- points `DATABASE_URL` at that local Postgres instance
- mounts the full project directory into `/app`
- keeps `node_modules` inside a Docker volume so host files do not overwrite container dependencies
- mounts the same source into the worker container so code changes are picked up there too

Use this when you want live reload while editing code.

### `Makefile`
The Make targets are just shortcuts:

- `make up` -> `docker compose up --build`
- `make down` -> `docker compose down`
- `make build` -> `docker compose build`
- `make logs` -> `docker compose logs -f`
- `make dev` -> `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`
- `make dev-down` -> same dev stack, stopped cleanly
- `make dev-logs` -> follow dev logs

## Environment

The app expects variables from an env file.

Important ones for Docker:

- `DATABASE_URL`
- `CONVERSION_WORKER_URL`
- `CONVERSION_WORKER_TOKEN`
- `CONVERSION_WORKER_POLL_INTERVAL_MS`
- `CONVERSION_WORKER_MAX_ATTEMPTS`
- `CONVERSION_WORKER_RETRY_BASE_DELAY_MS`
- `JOB_STORAGE_ROOT`
- `DELETE_JOB_OUTPUT_AFTER_DOWNLOAD`
- `ADMIN_ACCESS_TOKEN`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `NEXT_PUBLIC_RAZORPAY_KEY_ID`
- `NEXT_PUBLIC_SKIP_PAYMENT`
- `CLOUDCONVERT_API_KEY` if you use that flow
- `TRUST_PROXY_HEADERS`

Keep `.env` as your local working file.

Local Docker uses these values:

- `APP_ENV_FILE=.env`
- the dev compose file overrides `DATABASE_URL` to point at the local Postgres container
- your app talks to the database through `postgres://postgres:postgres@db:5432/convert_to_pdf?schema=public`
- `TRUST_PROXY_HEADERS=false`
- `CONVERSION_WORKER_URL=http://worker:4000/convert`
- `CONVERSION_WORKER_TOKEN=local-worker-token`

For production, copy [`.env.production.example`](/home/dell/COurse/cash/convert-to-pdf/.env.production.example) to `.env.production` and set `DATABASE_URL` to your Neon Postgres connection string, for example:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
```

To run production-style Docker with that file, use:

```bash
APP_ENV_FILE=.env.production make up
```

For local Docker development, the dev compose file points the app at a local Postgres service:

```env
DATABASE_URL=postgresql://postgres:postgres@db:5432/convert_to_pdf?schema=public
```

Set `TRUST_PROXY_HEADERS=true` in production so the app can read the client IP from your reverse proxy headers.

Make sure you also set `ADMIN_ACCESS_TOKEN` in `.env.production`. You will use the same value to unlock the admin area at `/admin/login`.

The app forwards document conversion requests to the worker through `CONVERSION_WORKER_URL`, and the worker checks `CONVERSION_WORKER_TOKEN` before doing any processing.

In the current async flow, the app writes a queued job to Postgres and the worker drains that queue in the background. The old direct `/convert` worker endpoint is still available for manual tests, but the main app flow uses the job queue.

If a conversion fails in a way the worker considers transient, it re-queues the job with a backoff delay. Permanent failures are marked `failed` after the max attempt count is reached.

Temporary conversion artifacts live under `JOB_STORAGE_ROOT`. The app removes uploaded input files after a successful conversion, and the final PDF is exposed through the job download route. If you set `DELETE_JOB_OUTPUT_AFTER_DOWNLOAD=true`, the downloaded PDF is removed after the first download as well.

You can check the worker health directly at:

```text
GET /health
```

And from the app:

```text
GET /api/worker-health
```

Queue and job health can be checked at:

```text
GET /api/admin/metrics
```

Admin access works like this:

1. Open `/admin/login`
2. Enter the value from `ADMIN_ACCESS_TOKEN`
3. The app creates a short-lived httpOnly session cookie
4. You are redirected to `/admin`

The metrics endpoint accepts that cookie, or the admin token directly in `x-admin-metrics-token` / `Authorization: Bearer ...` if you are calling it from a script. The endpoint returns queue depth, retry timing, recent failures, and payment state counts.

## How To Run

### Local development

Use this when you are editing code on your machine:

```bash
make dev
```

This starts:

  - the Next.js app in dev mode
- a local Postgres container for Prisma
  - the isolated conversion worker container

Your local env file is `.env`, but the dev compose override replaces `DATABASE_URL` so the app uses the Postgres container.

### Production-like run

```bash
make up
```

Open the app at:

```text
http://localhost:3000
```

Stop it with:

```bash
make down
```

### Production deployment

Use this on the server after you create a `.env.production` file with your Neon connection string and production secrets:

```bash
APP_ENV_FILE=.env.production make up
```

This runs the built image, applies Prisma migrations, and starts the app with `npm start`.

To access the admin dashboard on the server:

1. Open `/admin/login`
2. Paste the value of `ADMIN_ACCESS_TOKEN`
3. After login, you will be redirected to `/admin`

The admin session is stored in a short-lived httpOnly cookie, so you do not need to paste the token again until it expires or you log out.

Stop it with:

```bash
make down
```

Follow logs with:

```bash
make logs
```

## When You Need A Rebuild

You do **not** need a rebuild for normal code edits in development mode.

You **do** need a rebuild if you change:

- `Dockerfile`
- `package.json`
- `package-lock.json`
- Prisma schema or generated client behavior
- any system dependency installed in the image

For the production-like stack, rebuild with:

```bash
make up
```

or:

```bash
make build
```

then:

```bash
make up
```

## Prisma And Database Notes

This project is now Postgres-first.

Production should use Neon Postgres, and local Docker development uses a separate Postgres container.

Prisma migrations live in `prisma/migrations`, and the container runs `npx prisma migrate deploy` on startup so the schema stays in sync with the database.

Use `.env` for local work and `.env.production` for the production server.

The conversion worker is intentionally separate from the web app so LibreOffice processing happens outside the main request process.

If you want the shortest version:

- local editing: `make dev`
- production server: `APP_ENV_FILE=.env.production make up`

## Common Commands

```bash
make up
make down
make build
make logs
make dev
make dev-down
make dev-logs
```

## Deployment

For production, the app should run on a Linux server with Docker installed, using:

- `docker-compose.yml` for the app container
- `.env.production` for secrets and production values
- Neon Postgres for `DATABASE_URL`
- a reverse proxy like Caddy or Nginx for HTTPS

### Recommended production flow

1. Provision a server
1. Install Docker and Docker Compose
1. Copy [`.env.production.example`](/home/dell/COurse/cash/convert-to-pdf/.env.production.example) to `.env.production`
1. Set `DATABASE_URL` to your Neon connection string
1. Set live Razorpay keys and `NEXT_PUBLIC_SKIP_PAYMENT=false`
1. Run:

```bash
APP_ENV_FILE=.env.production docker compose up -d --build
```

This will:

- build the app image
- run Prisma migrations
- start the container in the background

### With a custom domain

Put a reverse proxy in front of port `3000` so users reach the app over HTTPS.

- **Caddy** is the easiest option if you want automatic TLS
- **Nginx** also works if you already manage configs that way

The proxy should forward traffic to:

```text
localhost:3000
```

### DigitalOcean path

If you use a droplet:

- create an Ubuntu server
- install Docker
- open ports `22`, `80`, and `443`
- point your domain to the server IP
- use Caddy or Nginx for HTTPS

### AWS EC2 path

If you use EC2:

- launch Ubuntu
- install Docker
- allow ports `22`, `80`, and `443` in the security group
- assign an Elastic IP if you want a stable address
- use Caddy or Nginx for HTTPS

## Troubleshooting

- If the app does not reflect code changes, use `make dev` instead of `make up`
- If a dependency change is not picked up, rebuild the image
- If a container from an older image is still around, remove it with `docker ps -a` and `docker rm`
- If Prisma complains about the database, confirm `DATABASE_URL` in `.env`
