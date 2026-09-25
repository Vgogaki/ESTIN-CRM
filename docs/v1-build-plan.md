# ESTIN CRM — V1 Build Scope & Technical Support Plan

**22 September 2026**
Companion to the System Specification. This document freezes the V1 feature scope, sequences it into build phases, and sets out the minimum technical support required alongside AI-assisted development.

---

## Part 1 — Technical support: what is actually needed

The plan is to build with AI coding tools and bring in technical support for the parts AI cannot cover. This section defines that support precisely, so it can be scoped and priced rather than left open-ended.

### 1.1 The three engagement points

**A. Foundation setup — before building starts**

Infrastructure and architecture decisions that are set once and expensive to reverse.

- Cloud provider and region selection (EU hosting, for GDPR reasons)
- Server, database and environment provisioning (staging + production)
- Domain, TLS, DNS
- Deployment pipeline and version control setup
- Secrets management (API keys, database credentials, payment tokens)
- Backup configuration **and a tested restore**
- Baseline monitoring and alerting

*Estimated effort: 5–10 days.* One engagement, at the start.

**B. Security review — before launch**

Independent review by someone who did not write the code.

- Authentication and session handling
- Access control and role enforcement (server-side, not UI-only)
- KYC document storage, encryption, access restriction
- Payment and payout flows
- Database exposure, dependency vulnerabilities, secrets in the repository
- Penetration test (may be a separate specialist)

*Estimated effort: 3–5 days, plus remediation time.* Non-negotiable before real customer data.

**C. Ongoing support — from launch onwards**

Availability rather than output.

- Incident diagnosis and resolution
- Dependency patching and security updates
- Deployment oversight
- Escalation point when something breaks and the cause is unclear

*Estimated effort: 2–5 days per month initially, settling lower once stable.*

### 1.2 Indicative cost

Rates vary widely by market and seniority. As rough planning figures for an experienced contractor in Cyprus or the wider EU, day rates commonly fall in the €400–800 range. Treat these as placeholders and replace them with actual quotes.

| Engagement | Effort | Indicative cost |
|---|---|---|
| A. Foundation setup | 5–10 days | €2,000 – €8,000 one-off |
| B. Security review | 3–5 days | €1,500 – €4,000 one-off |
| Penetration test (if separate) | — | €3,000 – €8,000 one-off |
| C. Ongoing support | 2–5 days/month | €800 – €4,000 /month |

**First-year technical support: roughly €15,000 – €50,000**, depending on seniority and how much ongoing support is needed. Hosting, market data and trading platform costs are additional.

Compare this against (a) a full-time developer salary plus employer costs, and (b) the annual licence cost of TradeTech or a comparable vendor. All three are viable; make the comparison on real quotes.

### 1.3 What to look for in that person

- Has deployed and operated a production system handling payments or personal data
- Comfortable reviewing and taking ownership of AI-generated code
- Available on a defined response time, agreed in writing
- Independent of any vendor being evaluated

**What this person is not:** the builder. They are the safety net, the reviewer, and the person who responds when something breaks. Keeping that boundary clear is what keeps the cost at the level above.

### 1.4 Accountability

Whoever holds this role should be named internally as the technical owner of the system. Banks, payment providers and regulators ask who is accountable for systems holding client data. "We built it with AI" is not an answer; "our technical lead is X, under contract, with an independent security review dated Y" is.

---

## Part 2 — V1 build scope

Every module below is in scope for V1. Nothing is added after this point without a deliberate decision to move the launch date.

**Legend**
- 🟢 Prototyped: logic designed and demonstrated, needs a production rebuild
- 🟡 Partially designed: some work done, significant gaps
- 🔴 Not started: design and build both required
- ⭐ Blocking: other modules depend on this

---

### Phase 1 — Foundation

*Nothing else can be built safely until these exist. Retrofitting any of them is disproportionately expensive.*

| # | Module | Status | Notes |
|---|---|---|---|
| 1.1 | ⭐ Database schema & data model | 🟢 | **Built and migrated** — Person/account split, versioned Challenge Builder, spec §3 |
| 1.2 | ⭐ Trader authentication | 🟢 | **Built** — registration, email verification, login/logout, password reset, lockout, optional TOTP 2FA. Email delivery still stubbed (dev console log) pending a provider decision (spec §4.5) |
| 1.3 | ⭐ Admin roles & permissions | 🟢 | **Built** — six starting roles seeded as configurable data, server-side permission enforcement. Segregation-of-duties check (KYC reviewer ≠ payout approver) lands with the Phase 5 payout endpoint |
| 1.4 | ⭐ Audit logging | 🟢 | **Built** — every auth action logged with actor/action/entity/reason/IP; table is append-only at the database level (Postgres trigger rejects UPDATE/DELETE), verified directly |
| 1.5 | ⭐ Challenge Builder (configurable) | 🟢 | **Built** — multi-phase builder with a live/draft distinction; back-office screens to create, edit and publish. Phases as data, not code. See §2.1 |
| 1.6 | ⭐ Challenge versioning | 🟢 | **Built** — editing a type with zero accounts changes it in place; editing one with live accounts creates a new version and supersedes it, leaving existing accounts pinned to the old version. Automated test suite (`src/server/challenge-types.test.ts`) covers this directly, plus verified through the actual UI. Version history view shows a field-level diff between versions |
| 1.7 | Terms acceptance records | 🟢 | **Built** — recorded against the exact challenge type version at account creation. The rulebook/terms document itself doesn't exist yet (brand/entity naming still open, decisions.md #9), so this uses a placeholder version string — swap in the real document version once legal drafts it |
| 1.8 | Environments & deployment | 🟡 | **Dockerfile built and verified** — builds, runs migrations, serves requests, tested end-to-end locally against a real Postgres instance. Staging/production hosting, secrets management, backups, and monitoring are the technical contractor's Foundation Setup — see `docs/deployment.md` |

### Phase 2 — Commercial flow

| # | Module | Status | Notes |
|---|---|---|---|
| 2.1 | ⭐ Order intake API | 🟢 | **Built** — `POST /api/v1/orders`, idempotent on `order_ref` (verified: replayed request returns the same account, concurrent double-submit handled via the DB unique constraint). Pins to the exact challenge type version shown at checkout. Detects same-email-different-name and flags `identityMismatch`. Gated on a single shared API key (`ORDERS_API_KEY`) until real per-integration key management exists (spec §5.7, not built) |
| 2.2 | Payment integration | 🔴 | Provider selection, checkout, webhooks — blocked on decision #5 |
| 2.3 | Refunds & chargebacks | 🔴 | Including account voiding on chargeback — blocked on decision #5 |
| 2.4 | Purchase & payment history | 🟢 | **Built** — `Payment` record created per order, shown on the trader detail page |
| 2.5 | KYC collection & review | 🟢 | **Built and verified live** — status chips on the trader detail page, a Documents list per person with working "View" links, and reject-with-reason (required, shown back to the trader, cleared on any status change or re-upload) |
| 2.6 | KYC document storage | 🟡 | **Built and verified live** — AES-256-GCM encryption at rest (key from `KYC_ENCRYPTION_KEY`), storage abstracted behind `storeEncrypted`/`retrieveDecrypted`/`deleteStored` so a real object-storage vendor can be swapped in later, access restricted to admins with `kyc.view`, every document view separately audit-logged (`kyc_document.viewed`), GDPR erasure endpoint removes the file and DB row. Still open: object-storage vendor (currently local disk, `.kyc-storage/`) and retention/refresh period |
| 2.7 | Back-office trader management | 🟢 | **Built** — Traders list (search, status filter, person-grouped with account pills), detail page (account tabs, live rule meters, manual status/phase/equity override with reason, KYC, notes, void-with-reason, identity-mismatch banner, payment history) |

### Phase 3 — Rules engine & platform integration

*This phase makes the product real. Nothing can be tested end to end before it.*

| # | Module | Status | Notes |
|---|---|---|---|
| 3.1 | ⭐ Rules engine | 🟡 | **Evaluation + automatic transitions built** (`src/server/rules.ts`) — same breach/pass formulas as spec §4.2, with a full test suite (`rules.test.ts`): both drawdown types, daily/max loss at the exact limit, profit target with/without minimum trading days, combined conditions, and the auto-transition decision itself (3.4). What's still missing for a real "engine": the equity feed to drive it — every evaluation today runs off equity entered manually via the trader detail override, standing in until 3.2/3.3 land |
| 3.2 | ⭐ Equity feed integration | 🟡 | `POST /accounts/{id}/equity`. **Depends on 3.3.** Demonstrated in the terminal prototype |
| 3.3 | ⭐ Trading platform selection | 🔴 | Licence vs. build (spec §9). **Decision required; blocks 3.2** |
| 3.4 | Breach & pass automation | 🟢 | **Built and verified live** — every time an admin updates an account's equity (standing in for the real feed), it's automatically re-evaluated: a breach closes the account (`status: breached`, `phase: closed`) and a passed target moves it to `pass_review`, each as its own audit entry (`actorType: system`, separate from the admin's own override entry). Explicitly setting status/phase in the same request is respected and skips the automation, so an admin's own decision (e.g. voiding for an unrelated reason) is never silently overwritten. Full test suite in `rules.test.ts` (`determineAutoTransition`) |
| 3.5 | Time limits & account expiry | 🟢 | **Built and verified live** — first use of pg-boss (added to the stack now that a module actually needs it): `src/instrumentation.ts` starts it when the server boots, scheduling a sweep every 15 minutes (`src/server/jobs/expire-accounts.ts`) that closes any active evaluation-phase account past its challenge phase's `timeLimitDays`, audit-logged like the 3.4 automation. Traders see remaining days on their dashboard; admins see it on the trader detail page. Deadline math is a pure, fully tested function (`src/server/expiry.ts`) |
| 3.6 | Instrument restrictions | 🔴 | Enforced at order entry, which is platform-side |
| 3.7 | Pending tasks queue | 🟡 | **Partially built, pulled forward** — rule breaches, ready-to-pass, pass review, KYC submitted, funded-without-KYC and identity-mismatch all live at `/admin/pending-tasks`, verified end to end. Left out: pending withdrawals and breached-trader offer leads (Withdrawal/Offers have no UI yet — Phase 5/6-7) |

### Phase 4 — Trader portal

| # | Module | Status | Notes |
|---|---|---|---|
| 4.1 | Dashboard & objectives | 🟢 | Breach level shown in currency, not only % |
| 4.2 | My plans / phase progression | 🟢 | **Updated** — the dashboard now lists the trader's actual accounts (challenge, size, status, phase, time remaining) instead of a hardcoded "no accounts yet" placeholder left over from before order intake existed. Still no rule meters on the trader side (admin-only for now, `/admin/traders/[person]`) |
| 4.3 | KYC upload | 🟢 | **Built and verified live** — `/portal/kyc`, four document types (identity front/back, proof of address, selfie), JPEG/PNG/PDF up to 10MB, status badge, rejection reason shown with a prompt to re-upload |
| 4.4 | Notifications centre | 🟡 | **In-app list built and verified live** — `/portal/notifications`, read/unread state (unread badge in the nav, clears on visit), wired to every event this codebase currently produces: account created, breach, pass under review, time-limit expiry, KYC submitted/verified/rejected. Not wired: payouts, offers, competitions, risk notices, general system messages — none of those have a triggering event built yet either (Phase 5/6/7) |
| 4.5 | Transactional email delivery | 🔴 | Sending service, deliverability, templates. **Not on the original list; the notifications centre needs a delivery mechanism behind it.** In-app notifications (4.4) don't depend on this — email is the "and, where marked, an email" half of modules-to-design.md §4.4/4.5, still open |
| 4.6 | Support / messaging | 🔴 | Threads, statuses (Open / Awaiting Trader / Resolved), linked to User 360 |

### Phase 5 — Payouts

| # | Module | Status | Notes |
|---|---|---|---|
| 5.1 | Payout request flow | 🟢 | Gated on funded phase and verified KYC, server-side |
| 5.2 | Approval workflow | 🟢 | Segregation of duties: reviewer ≠ approver |
| 5.3 | Payout rails integration | 🔴 | Provider selection |
| 5.4 | Payout ledger & history | 🟡 | |
| 5.5 | Finance reporting & export | 🔴 | Revenue recognition of fees to be agreed with your accountant. **Not on the original list** |

### Phase 6 — Risk & jurisdiction

*Split on purpose: the first group is needed before launch, the second can follow.*

**Before launch: this is the fraud this business specifically attracts**

| # | Module | Status | Notes |
|---|---|---|---|
| 6.1 | Multiple-account detection | 🔴 | Linked by payment instrument, device, IP |
| 6.2 | Duplicate / suspicious identity detection | 🟡 | Email/name mismatch already prototyped |
| 6.3 | Restricted-country controls | 🔴 | Admin-configurable list; block, or route to Pending Review |
| 6.4 | Restricted-jurisdiction matrix | 🔴 | **Business task, not development.** Four separate inputs: sanctions, payment provider rules, data vendor licence terms, legal advice on marketing |
| 6.5 | KYC country vs. IP / trading-location mismatch | 🔴 | |

**After launch**

| # | Module | Status | Notes |
|---|---|---|---|
| 6.6 | Device fingerprinting | 🔴 | |
| 6.7 | Trader risk profiles & flags | 🔴 | |
| 6.8 | Copy-trading / inverse-trading detection | 🔴 | The opposing-positions attack across accounts; both incumbent systems have this |

### Phase 7 — Growth & content

*Valuable, but nothing depends on them. Can ship after launch.*

| # | Module | Status | Notes |
|---|---|---|---|
| 7.1 | Offers & discount campaigns | 🟢 | Needs server-side redemption limits |
| 7.2 | Competitions | 🟢 | Legal check on paid-entry prize contests first |
| 7.3 | User 360 profile | 🟡 | Aggregation view; build once the underlying modules exist |
| 7.4 | Affiliates | 🔴 | |
| 7.5 | Training / educational content | 🔴 | |

---

### 2.1 Challenge Builder: the configurable model

This is the most important architectural decision in the scope, and it is the right one.

Phases are **data, not code**. The engine evaluates "phase N of M against these parameters." Configurable per challenge:

- Number of phases (0 = instant funded, 1, 2, 3…)
- Per phase: profit target %, daily loss %, max loss %, drawdown type (trailing/static), minimum trading days, time limit
- Account size, fee, currency
- Leverage cap, permitted instruments
- Profit split %, payout cycle, minimum payout
- KYC timing
- Product type: standard / promotional / competition-linked

One-step, two-step, instant-funded and competition products then become configuration rather than new logic.

**Two parameters carry hidden work:** time limits need a scheduled expiry job, and instrument restrictions must be enforced at order entry, which happens on the platform side rather than in the CRM.

---

## Part 3 — Critical path

Three items block more than their share. Resolve them first.

1. **Trading platform decision** (3.3). It blocks the equity feed, which blocks all end-to-end testing. Ask TradeTech whether market data is included in their pricing.
2. **Payment provider selection** (2.2). It affects the order API, refunds and chargebacks, and feeds the restricted-country matrix.
3. **Technical support engagement** (Part 1). Foundation setup has to happen before Phase 1 code is written.

---

## Part 4 — What "ready for testing" means

**Internal logic testing.** Possible now, using the existing prototypes. Worth doing: confirm the rules behave as intended and the workflows match how you will actually operate.

**Integration testing.** Requires Phases 1–3 complete and a trading platform connected.

**User acceptance testing.** Requires Phases 1–5 and a staging environment.

**Live launch.** Requires all pre-launch items, a signed-off security review, and the jurisdiction matrix settled.

Freezing scope here is the right call. The next step after freezing is **starting the build**, not scheduling user testing.

---

## Part 5 — Open decisions

Still outstanding from the specification:

1. Equity or balance for breach evaluation?
2. Trading day rollover time and reference timezone?
3. Maximum pass-review period (committed internally)?
4. Trading platform: licence or build?
5. Payment provider and currencies?
6. Payout rails?
7. Affiliate programme in V1 or later?
8. Which entity holds the customer relationship, and under what permission?
9. Brand name: trademark clearance not yet done
10. Revenue recognition treatment of challenge fees
