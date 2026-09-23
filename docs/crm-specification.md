# Prop Trading Platform — System Specification

**Draft v0.1 · September 2026**
Back-office CRM and trader-facing portal for a Cyprus-based proprietary trading evaluation firm.

This document is the build specification. It describes what the system does, what data it holds, and the contracts between its parts. It is written to be handed to a development team or used to evaluate a vendor proposal.

---

## 1. What this system is

The firm sells **simulated trading evaluations**. A customer pays a fee, receives a demo account with a defined set of rules, and if they meet the profit target without breaching the loss limits, they progress to a "funded" account and receive a share of simulated profits as real payouts.

There is no live market execution and no customer capital at risk. This matters architecturally: the system does not need an order-matching engine or exchange connectivity. It needs a **price/equity feed**, a **rules engine** that evaluates accounts against that feed, and the commercial and operational machinery around it.

### 1.1 Scope of this document

**In scope:** trader records, challenge configuration, rule evaluation, KYC workflow, payouts, competitions, the operations queue, the public API, and the trader portal.

**Out of scope (decide separately):** the trading platform itself (build vs. licence — see §9), payment processing, email/notification delivery, affiliate programme, and the marketing website.

---

## 2. Core architectural decisions

These are the decisions that shape everything else. They came out of reviewing two incumbent systems (Leverate, TradeTech Solutions) and prototyping the screens.

### 2.1 One database, multiple interfaces

The trader portal and the back office are **two front ends over one API and one database**. They are not two systems.

```
Website / checkout ──POST /api/v1/orders──────┐
                                              │
Trading platform ──POST /api/v1/.../equity────┼──► API ──► Database
                                              │
Trader portal ◄──GET /api/v1/me/accounts──────┤
                                              │
Back office ◄─────────────────────────────────┘
```

**Why it matters commercially:** a developer quoting to build "two platforms" has misunderstood the work. The second interface is a view, not a system.

### 2.2 Rules live on challenge types, not on traders

A **Challenge Type** is a reusable template holding every rule: account size, fee, profit target, daily loss limit, maximum loss limit, drawdown method, minimum trading days, profit split, payout cycle, and KYC timing.

A trader record references a challenge type. It does not carry its own copy of the rules.

**Why:** rules change. When they do, you change the template, not every affected record. It also makes the rules engine testable in isolation — you can unit-test "does this equity curve breach this template" without touching the CRM at all.

**Important caveat:** changing a template must **not** retroactively alter the terms of accounts already sold. A trader who bought under a 10% target cannot be moved to 12% mid-evaluation. Implement this by **versioning templates**: editing a live template creates a new version; existing accounts stay pinned to the version they purchased. This is both a fairness requirement and a consumer-protection one.

### 2.3 The equity feed is the only missing piece

Every other part of the system can be built and tested without a trading platform. The rules engine, the task queue, the payout gating, the portal — all of it works off one number per account, updated on a schedule: **current equity**, plus day-start equity, peak equity, and trade count.

This means the trading platform decision (§9) can be deferred without blocking development.

---

## 3. Data model

### 3.1 ChallengeType

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable identifier, referenced by checkout |
| `version` | integer | Increments on edit; accounts pin to a version |
| `name` | string | Trader-facing |
| `account_size` | decimal | Simulated starting balance |
| `fee` | decimal | Purchase price |
| `currency` | string | |
| `steps` | integer | 1 = one-step evaluation, 2 = two-step |
| `profit_target_pct` | decimal | Per step |
| `daily_loss_pct` | decimal | |
| `max_loss_pct` | decimal | |
| `drawdown_type` | enum | `trailing` \| `static` |
| `min_trading_days` | integer | Anti-lottery control |
| `profit_split_pct` | decimal | Trader's share |
| `payout_cycle_days` | integer | |
| `kyc_timing` | enum | `at_creation` \| `after_evaluation` \| `at_first_payout` |
| `active` | boolean | Sellable vs. archived |

### 3.2 Trader (customer)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `full_name`, `email`, `country` | string | |
| `kyc_status` | enum | `not_started` \| `submitted` \| `verified` \| `rejected` |
| `created_at` | timestamp | |

One trader may hold several accounts. Keep the person and the account separate — this is a mistake that is expensive to correct later.

### 3.3 Account (a purchased challenge)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `trader_id` | uuid | |
| `challenge_type_id` + `version` | | Pinned at purchase |
| `order_ref` | string | From checkout; **unique** |
| `phase` | enum | `evaluation` \| `pass_review` \| `funded` \| `closed` |
| `status` | enum | `active` \| `passed` \| `breached` \| `closed` |
| `equity`, `balance` | decimal | From feed |
| `day_start_equity` | decimal | Reset at broker day rollover |
| `peak_equity` | decimal | For trailing drawdown |
| `trading_days` | integer | Days with ≥1 closed trade |
| `started_at`, `ended_at` | timestamp | |

### 3.4 Supporting entities

- **EquityTick** — `account_id`, `equity`, `balance`, `open_pnl`, `closed_trades`, `trading_day`, `timestamp`. Retain for the equity curve and for dispute evidence.
- **Withdrawal** — `account_id`, `profit`, `split_pct`, `amount`, `method`, `status` (`pending`/`approved`/`declined`/`paid`), `requested_at`, `decided_by`, `decided_at`, `decision_note`.
- **Competition** and **CompetitionEntry** — see §7.
- **AuditLog** — see §10.

---

## 4. The rules engine

This is the commercial heart of the system and should be built as an isolated, heavily tested module.

### 4.1 Inputs

Account state (equity, day-start equity, peak equity, trading days) plus the pinned challenge type version.

### 4.2 Derived limits

```
profit_target   = account_size × profit_target_pct / 100
daily_loss_cap  = account_size × daily_loss_pct  / 100
max_loss_cap    = account_size × max_loss_pct    / 100

daily_loss_used = max(0, day_start_equity − equity)

total_loss_used = trailing:  max(0, peak_equity   − equity)
                  static:    max(0, account_size  − equity)

breach_floor    = trailing:  peak_equity  − max_loss_cap
                  static:    account_size − max_loss_cap
```

### 4.3 Evaluation outcomes

| Condition | Outcome |
|---|---|
| `daily_loss_used ≥ daily_loss_cap` | **Breach** — account closed |
| `total_loss_used ≥ max_loss_cap` | **Breach** — account closed |
| `pnl ≥ profit_target` AND `trading_days ≥ min_trading_days` | **Pass** — move to pass review |

### 4.4 Decisions the business must make

These are not technical questions and the engine cannot be finished without answers.

1. **Does equity or balance trigger a breach?** Equity includes open positions; balance does not. Equity-based is stricter and industry-standard, and must be stated plainly in the rules the trader accepts.
2. **When does the trading day roll over?** Needs a fixed broker-time reference, not the trader's local midnight.
3. **Does a breach close the account immediately or at end of day?** Immediate is normal.
4. **Is passing automatic or reviewed?** The prototype routes passes to a review queue. Manual review is a fraud control, but it must not become a pretext for withholding legitimate passes — define a maximum review period and hold to it.
5. **What counts as a trading day?** Any closed trade, or a minimum volume?

### 4.5 A note on incentives

The firm's revenue comes from fees paid by traders who mostly fail, while its payouts go to those who succeed. That structure creates an obvious temptation to make rules ambiguous, breaches easy, and payouts slow.

Build against that temptation deliberately: version rules so they cannot change under a live account, log every status change with an actor and timestamp, show traders the same numbers the back office sees, and set internal service levels for pass review and payout processing. These are cheap to build now and very hard to retrofit — and they are exactly what a regulator, a payment provider, or an acquirer will examine.

---

## 5. Back office — screens and behaviour

### 5.1 Firm statistics
Fee revenue, payouts approved, net position, challenges sold, funded traders, pass rate. Revenue and payout trends over 12 months. Competition acquisition metrics (§7).

### 5.2 Pending tasks — the operations queue

The single most valuable operational screen: what needs doing today, derived automatically rather than tracked by hand.

- Rule breaches flagged (engine detected, awaiting action)
- Ready to pass (target met, minimum days met)
- Pass review needed
- KYC submitted, awaiting review
- **Funded accounts without verified KYC** — a compliance exception that should not exist
- Pending withdrawals, with total value

Each entry links to the underlying record. Counts badge in the navigation.

### 5.3 Traders
Searchable, filterable list. Detail view shows the live rule meters, phase/status/KYC controls, payout history, and a notes log.

### 5.4 Withdrawals
Queue with trader, country, account size, profit, split %, amount, KYC status, and decision actions.

**Hard control: approval is blocked unless KYC is verified.** Enforce server-side, not only in the UI.

Every decision records who made it, when, and why. CSV export for finance.

### 5.5 Challenge types
CRUD over the templates in §3.1, with versioning per §2.2.

### 5.6 Competitions
See §7.

### 5.7 Integrations
API key management, webhook configuration, delivery logs.

---

## 6. Trader portal

### 6.1 Dashboard
Current equity and P&L since start. Three objective meters mirroring the engine exactly: profit target, daily loss used, maximum loss used.

**Requirement: state the breach level as a currency amount, not only a percentage.** Trailing drawdown is the single most misunderstood rule in this industry and the most common source of disputes. Showing "account closes below $47,500" prevents arguments that percentages do not.

Equity curve with target and breach lines overlaid. Objectives list. KYC status and document upload.

### 6.2 My plans
All accounts with a phase stepper (Evaluation → Pass review → Funded), purchase date, equity, and status.

**Deliberate omission:** the incumbent system shows a discounted "retry" countdown to traders who have just failed. A time-pressured upsell aimed at someone immediately after a loss is a poor practice and carries real regulatory and reputational risk. If the business wants it, adopt it as a conscious decision with legal input — not by copying a competitor's screen.

### 6.3 Payouts
Shows profit, split, and resulting amount. Request button gated on funded phase and verified KYC. Request history with status.

### 6.4 Competitions
Live leaderboard, the trader's own position, qualification progress.

---

## 7. Competitions

Contests on demo accounts, used primarily as an **acquisition channel**: entrants who later buy a challenge are the actual return.

### 7.1 Configuration
Name, dates, entry fee (may be zero), entrant cap, demo account size, minimum trades to qualify, ranking metric (return % or absolute P&L), risk rules, and a prize ladder (cash / funded account / free challenge / discount).

### 7.2 Required controls

- **Minimum trades to qualify.** Without it, a single maximum-size position wins. This converts the contest from a skill assessment into a lottery, which is both a commercial and a legal problem.
- **Tie-breaker rule.** Must be defined before launch.
- **Disqualified entrants** leave the leaderboard but stay in the list as leads.

### 7.3 Measurement
Entry revenue and prize cost give a direct margin, but a free competition is always negative on that basis. The real metric is **entrants converted to paying customers**. Track it explicitly.

### 7.4 Legal flag
Paid-entry prize competitions can fall under gaming or lottery regulation in some jurisdictions, separately from financial regulation. Free entry is generally the safer structure. **Obtain Cyprus legal advice before launch.**

---

## 8. API specification

REST, JSON, versioned. Authentication by API key for server-to-server; session or bearer token for the portal.

### 8.1 `POST /api/v1/orders`
Called by checkout on successful payment. Creates trader (if new) and account.

```json
{
  "order_ref": "WEB-2026-00418",
  "full_name": "Jane Michaelides",
  "email": "jane@example.com",
  "country": "CY",
  "challenge_type_id": "tpl-50k",
  "amount_paid": 300,
  "currency": "EUR",
  "payment_provider": "stripe",
  "affiliate_code": "PARTNER22"
}
```

**Must be idempotent on `order_ref`.** Payment providers retry webhooks; a duplicate must return the existing account, not create a second one. This is the most common integration bug in this class of system.

Returns `201` with account id, or `200` with the existing account on replay.

### 8.2 `POST /api/v1/accounts/{id}/equity`
Called by the trading platform. Drives the rules engine.

```json
{
  "equity": 51240.55,
  "balance": 50980.00,
  "open_pnl": 260.55,
  "closed_trades": 14,
  "trading_day": "2026-09-10",
  "timestamp": "2026-09-10T14:22:03Z"
}
```

Rule evaluation runs on receipt. Breach and pass transitions are recorded with the triggering tick for evidence.

### 8.3 `GET /api/v1/me/accounts`
Portal. Returns the authenticated trader's accounts, rule progress, and payout history. Must never return another trader's data — authorise on every request, not only at login.

### 8.4 `POST /api/v1/withdrawals`
Portal. Creates a pending withdrawal. Server-side validation of funded phase, verified KYC, and available profit — the UI gate is not sufficient.

### 8.5 Cross-cutting requirements
Rate limiting; signed webhooks; all money as decimal (never float); UTC timestamps with explicit broker-day handling; structured error responses.

---

## 9. The trading platform decision

The one genuinely open architectural question.

| Option | Description | Effort | Risk |
|---|---|---|---|
| **A. Licence a platform** | DXtrade, TradeLocker, Match-Trader and similar provide simulated evaluation accounts with APIs | Weeks | Vendor dependency, per-account cost |
| **B. Build a simulated engine** | Ingest a price feed, maintain virtual positions and equity | Months | Needs genuine engineering depth; pricing and fill logic are harder than they look |

Most firms in this market licence. The incumbent systems reviewed both provide their own platform. Given a non-technical founder and no in-house engineering team, **Option A is the realistic starting point**; the CRM specified here remains yours either way, which preserves the option to change platform later.

Whichever is chosen, it must satisfy §8.2.

---

## 10. Compliance and controls

Given a regulated-market context and a Cyprus entity, build these in from the start.

**Audit trail.** Every status change, rule edit, KYC decision, and payout decision recorded with actor, timestamp, before/after values, and reason. Immutable. This is the first thing anyone examining the business will ask for.

**Rule immutability per account.** Per §2.2.

**Segregation of duties.** The person who reviews KYC should not be the person who approves the payout. Build roles and permissions now; retrofitting them is painful.

**Data protection (GDPR).** KYC documents are sensitive personal data: encrypt at rest, restrict access, define a retention period, and support erasure requests for data not under a legal hold.

**Fraud detection** (later phase, but design for it): copy-trading and inverse-trading across accounts, news-event trading, and accounts linked by payment instrument, device, or IP. Both incumbent systems have this because the attack is real — groups open multiple accounts and take opposing positions so that one passes regardless of market direction.

**Payout integrity.** Service levels for pass review and payout processing, monitored and reported.

---

## 11. Build sequence

**Phase 1 — Foundation.** Data model, challenge types with versioning, trader and account records, audit log, authentication and roles.

**Phase 2 — Commercial flow.** `POST /orders` with idempotency, checkout integration, KYC workflow, back-office trader management.

**Phase 3 — Rules engine.** Evaluation logic with a full test suite, equity feed endpoint, breach and pass transitions, the pending-tasks queue.

**Phase 4 — Trader portal.** Dashboard, objectives, plans, KYC upload.

**Phase 5 — Payouts.** Request flow, approval queue with KYC gating, finance export.

**Phase 6 — Growth.** Competitions, affiliates, offers and discount codes, notifications.

**Phase 7 — Risk.** Fraud detection, country-level profitability analysis, risk dashboards.

Phases 1–3 are the system. Everything after is commercially valuable but not load-bearing.

---

## 12. Open questions

To be resolved before or during Phase 1:

1. Equity or balance for breach evaluation? (§4.4)
2. Trading day rollover time and timezone reference?
3. One-step or two-step evaluations, or both?
4. Is pass review manual or automatic, and what is the maximum review period?
5. Trading platform: licence or build? (§9)
6. Payment provider(s), and which currencies?
7. Payout methods and provider?
8. Is the affiliate programme in scope for launch?
9. Which entity holds the customer relationship, and under what regulatory permission?
10. Brand and legal entity naming — trademark clearance not yet done.

---

## Appendix A — Reference prototypes

Two working prototypes accompany this document, built during specification:

- **Back office** — firm statistics, pending tasks, traders, withdrawals, competitions, challenge types, integrations
- **Trader portal** — dashboard, plans, payouts, competitions

They demonstrate the screens and the rules engine logic. They are not production code: they hold data in browser storage with no server, no authentication, and no audit trail. Treat them as clickable reference, not as a starting codebase.

## Appendix B — Systems reviewed

- **Leverate** — trader-facing portal; source of the objective-meter layout and phase stepper conventions
- **TradeTech Solutions** — back office; source of the challenge-template architecture, the pending-tasks queue pattern, and the risk-analysis feature set
