# Deployment

What's already built, and what the technical contractor still needs to
decide and set up ("Foundation setup," `v1-build-plan.md` Part 1.1). Nothing
here provisions real infrastructure — that's deliberately their call, made
with real quotes and a real hosting account.

## What's already built

- **`Dockerfile`** — multi-stage build producing a small, self-contained
  production image (`output: "standalone"` in `next.config.ts`). Built and
  smoke-tested locally against a real Postgres instance: it builds, runs
  migrations on startup, serves requests, and correctly enforces auth on
  protected routes.
- **`docker-entrypoint.sh`** — runs `prisma migrate deploy` before starting
  the server, on every container start. This is safe with multiple replicas
  starting at once — Prisma takes an advisory lock, so concurrent runs don't
  race. If the contractor's deployment pipeline prefers running migrations
  as a separate release step instead (e.g. to gate a rollout on migration
  success before traffic shifts), that's a reasonable alternative; either
  works.
- **`docker-compose.yml`** — local Postgres only, for development. Not
  intended for production use as-is.
- **`prisma/migrations/`** — the full migration history, applied with
  `prisma migrate deploy` (not `migrate dev`, which is interactive-only).
- **Scheduled jobs (pg-boss)** — `src/instrumentation.ts` starts pg-boss
  once when the server process boots (module 3.5, account expiry sweep
  every 15 minutes; more jobs can register the same way later). pg-boss
  manages its own schema in the same Postgres database on first start, so
  the DB user in `DATABASE_URL` needs privileges to create it (`CREATE` on
  the database), not just read/write on the app's own tables. Safe to run
  from every replica if the app is ever scaled beyond one instance —
  pg-boss's scheduling and job delivery are already designed for that.

## Required environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Currently unused directly by application code (sessions are opaque, DB-backed tokens — see `src/server/security/session.ts`), kept as a reserved secret for future use. Generate with `openssl rand -base64 32` |

More will be added as later phases need them: a payment provider key, a KYC
provider key, an email-sending provider key, payout rails credentials. None
of these exist yet — see `docs/decisions.md` for what's still open.

## What the contractor needs to set up

Per `docs/v1-build-plan.md` Part 1.1 ("Foundation setup"):

1. **Cloud provider and region** — EU only, for GDPR (CLAUDE.md's hosting
   rule). This repo's Docker image should run on any container platform
   (Fly.io, Render, a plain VPS with Docker, ECS, etc.) — nothing here is
   tied to a specific vendor.
2. **Managed PostgreSQL** — staging and production, in the same EU region.
   `docker-compose.yml`'s local Postgres is not what should run in
   production.
3. **Secrets management** for the environment variables above — not
   committed to the repo (`.env` is gitignored), not passed as plain
   `docker run -e` flags in a shared shell history.
4. **TLS and domain.**
5. **Backups, and a *tested* restore** — per the build plan, this is
   explicitly not just "backups configured."
6. **Baseline monitoring and alerting** — at minimum, is the app up, and is
   the database reachable.
7. **Deployment pipeline** — how a merged change actually reaches
   production. This repo doesn't include CI config; that's a deliberate
   choice left to whoever sets this up, since it depends on the chosen
   platform and where the repository ends up hosted (not yet pushed
   anywhere but this machine — see the founder about that).

## Building and testing the image locally

```bash
docker build -t estin-crm .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/dbname" \
  -e AUTH_SECRET="$(openssl rand -base64 32)" \
  estin-crm
```

Points at whatever `DATABASE_URL` you give it — including a local
`docker-compose` Postgres on the same Docker network, which is how this was
verified during Phase 1 (see `docs/dev-environment-notes.md` for the exact
command used, including the Windows-specific workaround for this machine).
