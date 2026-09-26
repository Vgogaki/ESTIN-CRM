# Dependencies

Why this exists: some systems built with AI assistance accumulate many
third-party packages, then break or become impossible to update when those
packages change underneath them. This file records what we depend on, why, and
the rules that keep that from happening here. Checked 26 September 2026.

## The numbers

| | Count |
|---|---|
| Packages we chose to depend on — **runtime** | **13** |
| Packages we chose to depend on — **development only** (tests, linting, build tooling) | **14** |
| Everything installed, including packages *those* pull in | 554 |
| …of which ship to production | ~200 |

The 554 is normal for a Next.js application and is dominated by the framework,
Prisma, ESLint and Tailwind's own dependencies — not by things added for this
project. **No package was added for a feature that could reasonably be a few
lines of our own code.** There are no CMS-style "plug-ins".

## Runtime (13)

| Package | Why | Notes |
|---|---|---|
| `next`, `react`, `react-dom` | The application framework | Core. Major upgrades are deliberate projects |
| `prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg` | Database access and migrations | Move **together** — never upgrade one alone. `prisma` is a runtime dependency because the container runs `migrate deploy` on start |
| `zod` | Request validation | |
| `bcryptjs` | Password hashing | Pure JavaScript, no sub-dependencies |
| `otplib` | Two-factor codes | |
| `pg-boss` | Scheduled jobs (account expiry) | Keeps its own schema in our Postgres |
| `dotenv` | Reads `.env` for scripts | |
| `nodemailer` | Sends email through any provider's SMTP relay (module 4.5) | Added 26 Sep 2026. Zero sub-dependencies, long-established. Chosen over a vendor's own package so the email provider stays a settings choice, not a code dependency. Its type definitions (`@types/nodemailer`) are dev-only |

## Rules that prevent the problem

1. **Every version is pinned exactly** in `package.json` (no `^` or `~`), and
   `package-lock.json` is committed. Docker builds use `npm ci`, which installs
   *exactly* what the lockfile says and fails if they disagree. A package
   publishing a new version cannot change what we run.
2. **Nothing is updated automatically.** Updates are a deliberate change:
   patch/minor updates in one batch, with the full test suite (`npx vitest
   run`, `npx tsc --noEmit`, `npm run lint`) passing before merging; major
   versions one at a time, as their own task.
3. **Never run `npm audit fix --force` or `npm update` blindly.** `--force`
   would currently downgrade Prisma to v6, a breaking change.
4. **Adding a dependency needs a reason** written in the commit message.
   Prefer a few lines of our own code for anything small.
5. Some pairs are coupled: `vitest` 4 needs `vite` 7 (vitest 5 has no working
   build on Windows ARM64, so we stayed on 4); `@types/react` must track
   `react`.

## Known state

- **Security audit: 4 "high" findings**, all inside Prisma's *own command-line
  tooling* (`mysql2`, `deepmerge-ts` — Prisma bundles a MySQL driver we never
  use). The application never opens a MySQL connection, so this isn't
  reachable from the running system. The fix is an upstream Prisma release;
  revisit at the next Prisma update. The independent security review (build
  plan Part 1) should confirm this.
- **Behind on majors, on purpose:** Prisma 8 (still a release candidate),
  ESLint 10, TypeScript 7, Vitest 5, Vite 8, @types/node 26. None is needed
  today; each is a project of its own.
- **Minor/patch available:** `pg-boss` 12.35.0, `react`/`react-dom` 19.3.0,
  `dotenv` 18.0.4 — low urgency, batch into the next planned update.

## Routine

Monthly, on a branch: `npm outdated`, apply patch/minor updates, run the three
checks above, then click through the app. Quarterly: read the release notes for
the majors above and decide whether any is now worth doing.
