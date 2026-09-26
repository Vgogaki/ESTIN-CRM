# ESTIN CRM — Project Brief

Read this file first. It is the standing context for every build session.

## What we are building

The back-office CRM, trader portal and supporting API for a Cyprus-based proprietary trading **evaluation** firm. Customers pay a fee for a simulated trading account with defined rules. If they reach the profit target without breaching the loss limits, they progress to a funded (still simulated) account and receive a share of simulated profits as real payouts.

There is no live market execution and no customer capital at risk. The system does not need an order-matching engine. It needs: an equity feed from a trading platform, a rules engine that evaluates accounts against it, and the commercial and operational machinery around it.

The founder is **non-technical**. Explain decisions in plain language, and flag anything that needs her decision rather than choosing silently.

## Source documents, in order of authority

1. `docs/v1-build-plan.md`: frozen V1 scope, build phases, module status. **What to build and in what order.**
2. `docs/crm-specification.md`: data model, rules engine formulas, API contracts, compliance controls. **How it should work.**
3. `docs/modules-to-design.md`: design notes for modules not yet prototyped.
4. `docs/decisions.md`: decisions already made, and the ones still open.
5. `prototypes/`: working browser prototypes. **Reference for screens and logic only.** See `prototypes/README.md`.
6. `reference/`: competitor screenshots (functional reference) and brand boards (visual direction).

If the documents conflict, the build plan wins, then the specification. If something is unclear or undecided, ask. Do not guess on anything involving money, rules, KYC or permissions.

## Non-negotiable rules

These came out of the design work and apply to every module.

**Data model**
- A **person** (trader) is separate from their **accounts** (purchased challenges). One person, many accounts. Email identifies the person.
- KYC belongs to the person, not the account.
- Records are **never hard-deleted**. Use void-with-reason (soft delete) with actor and timestamp. The exception is a GDPR erasure request, which anonymises personal data while keeping the financial record.

**Challenge rules**
- Rules live on **challenge types**, not on individual accounts.
- Challenge phases are **data, not code**. The engine evaluates "phase N of M against these parameters". One-step, two-step, instant-funded and competition products are configuration.
- Challenge types are **versioned**. Editing a live type creates a new version. Existing accounts stay pinned to the version they bought. Never change the terms under a live account.

**Money and time**
- All money is stored as decimal / integer minor units. **Never floating point.**
- All timestamps in UTC. The trading-day rollover uses a fixed broker-time reference (still an open decision; see `docs/decisions.md`).

**Security and control**
- Every permission check, gate and limit is **enforced server-side**. UI checks are convenience only.
- Every state change writes to the **audit log**: actor, action, entity, before, after, timestamp, reason. The audit log is append-only.
- Payout approval is blocked unless KYC is verified AND there is no unresolved identity mismatch. Enforced server-side.
- Segregation of duties: the person who reviews KYC should not be able to approve the same trader's payout.
- No secrets, keys or credentials in the repository. Use environment variables.
- KYC documents are encrypted at rest with restricted access.

**Integrations**
- `POST /api/v1/orders` is **idempotent on `order_ref`**. A replayed payment webhook must return the existing record, never create a duplicate.
- Webhooks are signed and verified.

**Hosting**
- EU hosting only (GDPR).

## Technology stack

**Confirmed 2026-09-23.** One deployable unit: a single Next.js (App Router, TypeScript) app that hosts the public REST API (`/api/v1/...`), the back office (`/admin/...`), and the trader portal (`/portal/...`) over one PostgreSQL database. Prisma for the ORM and migrations, Zod for request/response validation, pg-boss (Postgres-backed) for scheduled jobs, Tailwind CSS for styling, Vitest for unit tests (especially the rules engine) and Playwright for end-to-end tests. Deployed as a Docker container to an EU region once the technical contractor sets up hosting.

Deliberately deferred (vendor choices, not architecture): payment provider, KYC provider, payout rails, transactional email provider, KYC document storage, and the trading platform itself (spec §9).

## How to work

- Build in the phase order in `docs/v1-build-plan.md`. Phase 1 (foundation) comes before anything else.
- The rules engine is an isolated module with a thorough automated test suite. Test every breach and pass condition, both drawdown types, multi-phase progression and edge cases at the exact limit.
- Build and verify in small steps. After each module, tell the founder what now works and how to try it.
- When a module depends on an open decision, build it so the decision is a configuration value, and flag it.
- Use the brand direction from `reference/brand/`: deep navy and near-black backgrounds, electric blue accent, premium and institutional in tone. The prototypes already implement this palette.
- Update `docs/v1-build-plan.md` module statuses as work completes.
- Record anything you could not build, or only partly built, in `docs/deferred-items.md` so it can be revisited. Don't leave it only in a status note.
- Keep dependencies minimal and pinned. Read `docs/dependencies.md` before adding or updating a package: every version is exact, the lockfile is committed, and nothing is updated without the tests passing. Do not run `npm audit fix --force` or `npm update` blindly.
