# Local dev environment notes

Practical notes for running this project locally, plus one workaround specific
to this machine that a different setup (e.g. the contractor's) probably won't
need.

## Normal local setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in `DATABASE_URL` / `AUTH_SECRET`
   (a `.env` already exists on this machine with working local defaults).
3. `npm run db:up` — starts Postgres in Docker (see `docker-compose.yml`).
4. `npm run dev` — starts the app at http://localhost:3000.
5. `npm run db:smoke` — quick check that the app can reach the database.

## Windows-on-ARM64 workaround: schema migrations

On this machine, Prisma's native `schema-engine-windows.exe` (needed for
`prisma migrate dev` / `prisma migrate deploy`) is blocked by Windows
Application Control ("Smart App Control" or a similar policy) — it's an x64
binary running under ARM64 emulation, and the policy refuses to run it. This
is a security setting on this specific machine; we deliberately did not
change it. This does **not** affect the running app itself — Prisma Client
talks to Postgres directly through the `@prisma/adapter-pg` driver adapter at
runtime, no native engine binary involved (see `src/server/db.ts`).

It only affects the dev-time command that computes and applies a schema
migration. When you change `prisma/schema.prisma` and need to create/apply a
migration **on this machine**, run it inside a Linux container instead, which
sidesteps the Windows policy entirely:

```bash
docker run --rm \
  --network estin-crm-handover_default \
  -v "estin-crm-handover_prisma_node_modules:/app/node_modules" \
  -v "$(pwd):/app" \
  -w /app \
  -e DATABASE_URL="postgresql://estin:estin_dev_password@db:5432/estin_crm" \
  node:22-bookworm-slim \
  sh -c "npm install && npx prisma migrate dev --name <migration_name>"
```

(In Git Bash, prefix with `export MSYS_NO_PATHCONV=1` first, or the `/app`
paths get mangled into Windows paths.)

After the migration is applied, run `npx prisma generate` natively on
Windows as normal (that command doesn't hit the blocked binary) so the
TypeScript types stay in sync.

If the technical contractor's machine doesn't have this restriction, they can
likely just run `npx prisma migrate dev` directly — worth confirming before
assuming the container workaround is needed there too.
