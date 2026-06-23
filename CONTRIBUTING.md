# Contributing to convert-to-pdf

Thanks for your interest in contributing. This document covers how to get the project running locally, how to propose changes, and a few things specific to this codebase that are easy to miss.

## A note before you start: this is not a stock Next.js app

This repo runs on a Next.js version with breaking changes relative to what most training data and tutorials assume — APIs, conventions, and even file structure can differ. Before writing code, especially anything touching routing, middleware-equivalents, or server APIs, read the relevant guide under `node_modules/next/dist/docs/` for this installed version, and pay attention to deprecation notices. See `AGENTS.md` in the repo root for the short version of this rule.

A concrete example: there is no `middleware.ts` in this app. Its equivalent is `proxy.ts` at the repo root. If you're used to `middleware.ts` from older Next.js versions, don't recreate it — extend `proxy.ts` instead.

When in doubt about whether something has changed from the Next.js you know, check the docs in `node_modules/next/dist/docs/` first.

## Local setup

1. **Clone your fork and install dependencies:**

   ```bash
   git clone https://github.com/<your-username>/convert-to-pdf.git
   cd convert-to-pdf
   npm install
   ```

2. **Set up your environment file:**

   ```bash
   cp .env.example .env
   ```

   Fill in the values in `.env` — at minimum a `DATABASE_URL` pointing at a Postgres instance, and an `ADMIN_ACCESS_TOKEN`. See `.env.example` for the full list and inline notes on each variable. Razorpay keys are only required if you're testing payments; you can set `NEXT_PUBLIC_SKIP_PAYMENT=true` to bypass payment locally.

3. **Apply Prisma migrations** (requires a reachable Postgres database):

   ```bash
   npx prisma migrate deploy
   ```

4. **Run the dev server:**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

   Note that document conversion is handled by a separate background worker process (`worker/conversion-worker.mjs`), not by the Next.js app itself. Depending on what you're working on you may need that worker running too — see the Docker path below for the easiest way to get the full stack (app + worker + Postgres) running together.

### Alternative: Docker

If you'd rather not install Postgres and LibreOffice locally, the project has a documented Docker-based setup that runs the app, the conversion worker, and a local Postgres container together. See [`DOCKER.md`](./DOCKER.md) for full instructions, including the `make dev` shortcut.

## Branch and PR workflow

1. Fork the repository.
2. Create a feature branch off `main`:

   ```bash
   git checkout -b feat/short-description
   ```

3. Make your changes, with focused commits.
4. Run lint before opening a PR (see below).
5. Push your branch to your fork and open a pull request against `main` on this repository.
6. Fill out the PR template — describe what changed and why, and how you tested it.

Please keep PRs scoped to a single concern where possible; it makes review much faster.

## Lint

Run lint locally before submitting a PR:

```bash
npm run lint
```

CI runs the same lint command on every push and pull request, so a failing lint check will block merge.

## Reporting bugs and requesting features

Please use the issue templates:

- **Bug report**: use the "Bug report" template when opening a new issue. Include reproduction steps, what you expected, what actually happened, and relevant environment details (OS, Node version, whether you're running via Docker or locally).
- **Feature request**: use the "Feature request" template to propose new functionality or improvements.

Before filing, please search existing issues to avoid duplicates.

## Code of Conduct

This project follows a [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you're expected to uphold it.
