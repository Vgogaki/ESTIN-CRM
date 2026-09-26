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
| 1.2 | ⭐ Trader authentication | 🟢 | **Built** — registration, email verification, login/logout, password reset, lockout, TOTP 2FA. The 2FA enrollment UI (`/portal/security`) was added alongside module 5.1 — the server logic and API routes existed since Phase 1, but nothing had ever exposed them to a trader, so 2FA was effectively unreachable self-service until now. Verification and reset emails now go through the 4.5 email system (delivered once a provider is configured) |
| 1.3 | ⭐ Admin roles & permissions | 🟢 | **Built** — six starting roles seeded as configurable data, server-side permission enforcement. Segregation-of-duties check (KYC reviewer ≠ payout approver) is built and verified as part of the Phase 5 payout endpoint (5.2) |
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
| 2.8 | Firm statistics dashboard | 🟢 | **Built and verified live.** **Not on the original list** — specced (crm-specification.md §5.1) and fully prototyped in `back-office.jsx`'s "Firm statistics" view, but never actually given a module number in this table; found and fixed while auditing what "handover requirements" actually covers. Now the admin landing page (`/admin`): revenue, payouts approved, net position, challenges sold, funded traders, pass rate, a "needs attention" summary (reuses 3.7's queue), a 12-month revenue/payout chart, and recent traders. The account-settings content that used to live at `/admin` moved to `/admin/account`. Single-currency sum, documented in `src/server/firm-stats.ts` — revisit if a second currency is ever sold |

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
| 3.8 | Account phase advancement (pass review → next phase / funded) | 🟢 | **Built and verified live.** **Not on the original list** — found while compiling `deferred-items.md`: passing moved an account to `pass_review` and stopped, and hand-setting `phase` to funded never reassigned the account's rules (`currentPhaseId`), so a "funded" account had no profit split and **payout requests failed**. Now an admin reviews a pass and clicks "Advance to <phase>" on the account (`POST /api/admin/accounts/[id]/advance`, `traders.edit`): moves to the next phase by order, restarts that phase's clock (`phaseStartedAt`), audit-logged with the review note, and notifies the trader. Funding is gated server-side on KYC per the challenge type's `kycTiming` (blocked unless verified, unless KYC is deferred to first payout — the "funded without KYC" exception the spec says shouldn't exist). Pure logic fully tested (`phase-advance.test.ts`); verified end to end: buy → hit target → pass review → advance blocked by unverified KYC → advance → funded on the funded rules → a payout request that used to fail now calculates (€2,000 profit × 80% = €1,600) and evaluation profit is *not* paid out. **Open:** equity/trading days on advancing is decisions.md #18 — built as an audited choice defaulting to reset to the account size; no "reject the pass" action (close by hand); the pass-review maximum period (decision #3) isn't enforced |
| 3.7 | Pending tasks queue | 🟡 | **Partially built, pulled forward** — rule breaches, ready-to-pass, pass review, KYC submitted, funded-without-KYC, identity-mismatch, and (since 5.1/5.2) pending payouts all live at `/admin/pending-tasks`, verified end to end. Left out: breached-trader offer leads (Offers has no UI yet — Phase 6/7) |

### Phase 4 — Trader portal

| # | Module | Status | Notes |
|---|---|---|---|
| 4.1 | Dashboard & objectives | 🟢 | **Built and verified live**, closing the gap the previous audit found. `/portal` now shows current equity and P&L since start, and the three objective meters mirroring the engine exactly (profit target, daily loss used, max loss used) — the same `Meter` component and math as the admin side, extracted to `src/components/ui/meter.tsx` so both stay in sync. Spec §6.1's explicit requirement — state the breach level as a currency amount, not only a percentage ("account closes below $47,500") — is built: `evaluateAccount()` now returns `dailyBreachLevel`/`totalBreachLevel`, tested at the exact boundary. Still missing: the equity curve with target/breach lines overlaid — blocked on the equity feed (3.2/3.3), since `EquityTick` has no real data to chart yet |
| 4.2 | My plans / phase progression | 🟢 | **Updated** — the dashboard now lists the trader's actual accounts (challenge, size, status, phase, time remaining) instead of a hardcoded "no accounts yet" placeholder left over from before order intake existed. Still no rule meters on the trader side (admin-only for now, `/admin/traders/[person]`) |
| 4.3 | KYC upload | 🟢 | **Built and verified live** — `/portal/kyc`, four document types (identity front/back, proof of address, selfie), JPEG/PNG/PDF up to 10MB, status badge, rejection reason shown with a prompt to re-upload |
| 4.4 | Notifications centre | 🟡 | **In-app list built and verified live** — `/portal/notifications`, read/unread state (unread badge in the nav, clears on visit), wired to every event this codebase currently produces: account created, breach, pass under review, time-limit expiry, KYC submitted/verified/rejected. Not wired: payouts, offers, competitions, risk notices, general system messages — none of those have a triggering event built yet either (Phase 5/6/7) |
| 4.5 | Transactional email delivery | 🟡 | **Built, provider not chosen.** Every in-app notification type now also queues an email, plus email verification, password reset and a test email. Staff edit the wording at `/admin/email` (fill-in fields like the trader's name, checked on save) and see every email sent with its status; failed sends retry automatically (every minute, up to 5 times) and can be retried by hand. Marketing emails (offers) go only to traders who opted in (registration checkbox or a toggle on their Notifications page) and carry a signed one-click unsubscribe link. Sending goes through any provider's SMTP relay, chosen by settings (`EMAIL_DRIVER`, `SMTP_URL`, `EMAIL_FROM`); until set, nothing is delivered and the email is only printed in the server log. Verified against a local test mail server. See deferred-items.md B5 |
| 4.6 | Support / messaging | 🟡 | **Built** — traders open conversations (topic, message, up to 3 JPG/PNG/PDF attachments of 10 MB, stored encrypted) at `/portal/support`; staff with `support.manage` reply, resolve and reopen at `/admin/support`. Statuses Open / Awaiting Trader / Resolved move automatically (staff reply → Awaiting Trader, trader message → Open, even on a resolved thread). The trader gets an in-app notification on each reply; threads needing a reply appear in Pending tasks. Every action is audited; a trader can only see their own threads and files. Replies are also emailed via 4.5. **Not built:** link into User 360 (7.3 not built, so a thread links to the trader profile), rate limiting |

### Phase 5 — Payouts

| # | Module | Status | Notes |
|---|---|---|---|
| 5.1 | Payout request flow | 🟢 | **Built and verified live** (previous 🟢 mark was stale — the flow didn't actually exist in code before this pass; corrected here). `POST /api/portal/withdrawals`, server-side gated on funded phase, verified KYC, two-factor authentication, and available profit (spec §8.4) — the UI gate is convenience only. Amount = (equity − account size − profit already reserved by a pending/approved/paid request) × profit split %, all `Decimal`, fully unit-tested (`withdrawals.test.ts`) |
| 5.2 | Approval workflow | 🟢 | **Built and verified live** (same stale-mark correction as 5.1). `PATCH /api/admin/withdrawals/[id]`, approve/decline with a required reason on decline. Segregation of duties enforced server-side: an admin who reviewed a trader's KYC (looked up from the audit log) cannot also approve that trader's payout — verified directly, blocked with a clear message, no audit entry written for the blocked attempt. Approval also re-checks, at the moment of approving, that KYC is verified, there is no unresolved identity mismatch, and no open payout country review (added later — approval originally relied on the request-time KYC check alone, missing the identity-mismatch gate CLAUDE.md requires). Optional four-eyes approval above a threshold (modules-to-design.md §1.3) is **not built** — no threshold has been decided |
| 5.3 | Payout rails integration | 🔴 | Provider selection. `Withdrawal.providerReference` added now so the column exists when a rail is chosen, same pattern as `Payment.providerTransactionId` |
| 5.4 | Payout ledger & history | 🟢 | **Built and verified live** — `/admin/withdrawals` (queue with trader, country, account size, profit, split %, amount, KYC status, decision actions, per spec §5.4), payout history on the trader detail page, and payout history + live "profit/split/amount" figures on the trader's own dashboard (spec §6.3). The "consistency rule check" spec mentions alongside this isn't shown — it needs per-trading-day equity history that doesn't exist yet (blocked on 3.2/3.3, the equity feed) |
| 5.5 | Finance reporting & export | 🟡 | **Built and verified live.** `/admin/finance`: pick a period (UTC, both end days included) and see, per currency (never added together), fees received, payouts approved/declined, net position and a by-month breakdown, plus two CSV downloads (fees ledger, payouts ledger). Payouts export needs `payouts.view`, fees export `reports.view` (verified: operations gets 403 on payouts); **every export is audit-logged** with type, period and row count; cells starting `= + - @` are neutralised against spreadsheet-formula injection; admin-test-tool orders are excluded by default (toggle to include). Pure summary/CSV logic unit-tested. **Deliberately not decided here:** this is *cash received at purchase* with no revenue-recognition rule applied (decisions.md #10, for the accountant). **Not possible yet:** refunds and chargebacks — module 2.3 doesn't exist, no refund amount is stored, so the page says "Not tracked" rather than showing a false zero; payouts are approved amounts (none can be marked paid until a payout provider exists). Stays 🟡 until #10 is decided and 2.3 exists |

### Phase 6 — Risk & jurisdiction

*Split on purpose: the first group is needed before launch, the second can follow.*

**Before launch: this is the fraud this business specifically attracts**

| # | Module | Status | Notes |
|---|---|---|---|
| 6.1 | Multiple-account detection | 🟡 | **Built and verified live for the signals we actually hold data for.** Links different *people* (one person with many accounts is by design) who share: a **reused KYC document** (same file under two people — strong), a **payment instrument** (strong; new optional `payment_instrument_ref` on `POST /api/v1/orders`, stored only as a hash, empty until a payment provider supplies one), or an **IP address** (weak — households, offices and VPNs share them, so an IP alone never reaches the queue). Detected as things happen (registration, login, order, KYC upload) and re-detected without ever failing the action; a **backfill** endpoint covers existing people. Linked people show on every profile with review actions (confirm / not-the-same, note required); strong open links appear in Pending tasks; a dismissed link only reopens when a genuinely new signal appears. **Flag for review, never auto-block** (per spec) — nothing here blocks anything. New permission `risk.review` (super_admin, compliance). **Not built:** device linking (needs 6.6 fingerprinting) and address linking (no address is collected). Unit-tested link logic (`account-links.test.ts`). Stays 🟡 until those two signals exist |
| 6.2 | Duplicate / suspicious identity detection | 🟢 | **Corrected — understated as prototype-only.** Email/name mismatch is actually built and live: flagged automatically on a repeat order under an existing email with a different name (`src/server/orders.ts`), surfaced in the pending tasks queue and a banner on the trader detail page, with an admin "mark reviewed" action, all audit-logged. What's still genuinely missing from this module's title: detection *linked by payment instrument, device, or IP* — that's 6.1, still 🔴 |
| 6.3 | Restricted-country controls | 🟡 | **Built and verified live; the list itself is yours to fill.** `/admin/countries`: per country, allowed / review / blocked, separately for registration, purchase, trading and payout. **Ships empty on purpose** — what belongs on it is legal/business (decisions.md #11, open), and a country with no row is allowed everywhere. Enforced server-side: a blocked country is refused at registration, on `POST /api/v1/orders`, and on a payout request (no person is created for a refused registration/order); "review" lets it through but opens a review that appears in Pending tasks, and an open payout-stage review holds payout approval. `GET /api/v1/country-check` lets checkout ask *before* taking payment — a blocked order is refused, but by then the money has moved and there's no refund flow yet (2.3). **Not built:** IP geolocation (needs a geolocation provider), a separate KYC-document country (KYC stores documents, not a structured country) — so today the country checked is the one declared at registration/on the order, which is also the billing country; trading-stage rules are stored but can't be enforced until there's a trading platform (3.3). New permission `countries.manage` (super_admin, compliance). Stays 🟡 until the list is decided |
| 6.4 | Restricted-jurisdiction matrix | 🟡 | **Business task, not development.** Four separate inputs: sanctions, payment provider rules, data vendor licence terms, legal advice on marketing. What development can do is built: the Countries page (6.2) shows a checklist of the four inputs (Pending / In progress / Done, with who confirmed it and when; "Done" requires a note) and says whether the list is settled. Nothing is decided by the system, and the country list is still empty until the business gathers the inputs. See deferred-items.md B6 |
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
| 7.1 | Offers & discount campaigns | 🟢 | **Built and verified live**, closing the exact gap this row used to flag. The prototype (`back-office.jsx`'s OffersView) demonstrated the screens but enforced nothing — "Mark redeemed" was a plain UI toggle with no cap check. Now: campaigns (code, percent/fixed discount, audience, challenge family, valid dates, max uses), the maxUses cap enforced server-side at issue time (a slot is reserved the moment an offer is sent, not just when redeemed — verified directly, both through the UI and a raw API call against an already-capped campaign), and real redemption wired into order intake (`POST /api/v1/orders` accepts an optional `offer_code`; a matching outstanding offer is marked redeemed atomically with the order, verified end to end including that a second redemption attempt correctly charges full price and logs as unresolved rather than double-spending). Campaign form now has a live price preview (normal fee, price with the offer, revenue given up per sale), a "Competition entrants" audience, and a per-campaign send delay after a breach (default 3 days, 0 = immediately — decisions.md's "not instantly" rule); the delay and the audience are enforced server-side at issue time, verified against a trader breached just now (rejected) vs. 5 days ago (accepted). `offer_received` notification gated on marketing consent per modules-to-design.md §4.4/4.5. `/admin/offers`, pending-tasks' "breached trader awaiting an offer" bucket now wired (previously left out for lack of a UI to act on) |
| 7.2 | Competitions | 🟡 | **Built and verified live; corrected — the previous 🟢 was wrong.** No prototype existed for this module (zero references in either prototype file; only crm-specification.md §7's prose), so it was never "prototyped" as the legend's 🟢 requires. Now built: `/admin/competitions` (config per spec §7.1: dates, entry fee, cap, demo account size, minimum trades to qualify, ranking metric, prize ladder), entrants with simulated equity/trade counts (stands in for the equity feed like 3.1), a ranked leaderboard where only qualified entrants get a rank (anti-lottery control, spec §7.2 — verified: +50% with 2 of 5 required trades stays unranked), disqualified entrants kept as leads, `/portal/competitions` (leaderboard, own position, qualification progress), `competition_results` notification on close, entrants-converted metric (spec §7.3), and the "Competitions as acquisition" block on Firm statistics. **Two open items built as configuration, not guessed:** the tie-breaker rule is a required free-text field per competition (spec §7.2 says it "must be defined before launch" — ties share a rank, no algorithm is auto-applied), and a competition with a non-zero entry fee cannot go active until legal sign-off is recorded on it (spec §7.4, Cyprus gaming/lottery regulation) — verified blocked, then allowed after sign-off. Prize cost sums cash prizes only; funded accounts / free challenges have a real but non-cash cost that isn't valued. Stays 🟡 until the tie-breaker and paid-entry legal questions are actually answered |
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

~~1. Equity or balance for breach evaluation?~~ **Decided 25 Sept 2026: equity.** See `docs/decisions.md`.
2. Trading day rollover time and reference timezone?
3. Maximum pass-review period (committed internally)?
4. Trading platform: licence or build?
5. Payment provider and currencies?
6. Payout rails?
7. Affiliate programme in V1 or later?
8. Which entity holds the customer relationship, and under what permission?
9. Brand name: trademark clearance not yet done
10. Revenue recognition treatment of challenge fees
