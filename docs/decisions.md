# Decisions Log

## Decided

| Area | Decision |
|---|---|
| Business model | Simulated evaluation accounts only. No client deposits, no live capital |
| Challenge structure | Configurable Challenge Builder: phases as data. Launch with one-step; two-step and others available by configuration |
| Launch challenge tiers | €25,000 / €50,000 / €100,000 accounts at €200 / €300 / €500 fees |
| Launch rules | 10% profit target · 5% max daily loss · 10% max overall loss, trailing (end-of-day high-water mark) · leverage up to 1:100 · 80/20 profit split to trader · payouts every 14 days · "best day" consistency rule (best day ≤ 50% of total positive-day profit) for payout eligibility |
| Data model | One person, many accounts. KYC on the person |
| Deletion | No hard delete. Void with reason. GDPR erasure by anonymisation |
| Same email, different name | Do not reject the purchase. Flag for review; block payouts until resolved |
| Rule changes | Versioned challenge types; live accounts pinned to purchased version |
| Breaches | Auto-close on breach (engine liquidates and marks Breached) |
| Passes | Routed to manual pass review |
| Payout gating | Requires funded phase + verified KYC + no open identity flag, server-side |
| Re-purchase offers | Offers module; breached-trader offers sent after a configurable delay (default 3 days), not instantly |
| "Retry at discount" countdown shown immediately after failure | **Not adopted.** Revisit only as a deliberate decision with legal input |
| Architecture | One database and API; back office and trader portal are two front ends over it |
| Build approach | AI-assisted build in Claude Code, with a contracted technical lead for setup, security review and ongoing support |
| Scope | V1 frozen per `v1-build-plan.md` |
| Breach evaluation basis | **Equity**, not balance (confirmed 25 Sept 2026 — industry norm, includes open positions). Already the basis for every money calculation built so far: the rules engine (`rules.ts`), the 3.4 auto-close/pass-review automation, and the payout calculation (`withdrawals.ts`). Was formerly open decision #1 below |

## Open: needs a decision

> **Deliberately left open for now.** Once the system is complete, every open decision below — and the ones flagged per module in `deferred-items.md` (including #18, what happens to equity when an account moves to its next phase) — gets reviewed and decided one at a time, module flow by module flow. Until then each is built as a configuration value or an explicit, audited choice rather than a silent assumption.

| # | Question | Blocks |
|---|---|---|
| 2 | Trading-day rollover time and reference timezone | Daily loss, trading-day count |
| 3 | Maximum pass-review period, committed internally | Pass workflow |
| 4 | Trading platform: licence (DXtrade, TradeLocker, Match-Trader, TradeTech) or build | Equity feed, all end-to-end testing |
| 5 | Payment provider and currencies | Orders, refunds, chargebacks |
| 6 | Payout rails / provider | Payouts |
| 7 | Affiliate programme in V1 or later | Scope. **Partly narrowed 27 Sept 2026:** *if* it ships, it's open to outside partners (not only existing traders), so it was built with its own affiliate portal/login rather than as a tab inside the trader portal. Whether it ships in V1 at all, and the commission model, are still open |
| 8 | Which legal entity holds the customer relationship, under what permission | Terms, KYC, payments |
| 9 | Brand name. Trademark clearance (EUIPO) not yet done | Branding |
| 10 | Revenue recognition of challenge fees (at purchase or deferred) | Finance reporting |
| 11 | Restricted-jurisdiction matrix (sanctions, payment provider rules, data vendor terms, legal advice) | Country controls |
| 12 | What counts as a trading day: any closed trade, or a minimum volume? | Rules engine |
| 13 | Paid-entry competitions: legal position in Cyprus and target markets | Competitions |
| 14 | KYC refresh policy (how often verified documents must be renewed) | KYC |
| 15 | Currency display: prototypes show $, business prices in € | All screens |
| 16 | **Minimum trading days.** Rulebook v1.0 says none; the prototypes default to 3 as an anti-luck control. Confirm which applies | Rules engine, pass logic |
| 18 | **What happens to equity and trading days when an account moves to its next phase.** Spec is silent. Built as an explicit, audited choice on the advance action, defaulting to *reset to the account size* (otherwise evaluation profit would be paid out on a funded account). Confirm this is right, and whether it should be fixed rather than chosen each time | Phase progression, payouts |
| 17 | **Trailing drawdown reference.** Rulebook v1.0 uses the end-of-day high-water mark; the prototypes track the intraday peak. Build to the rulebook unless changed | Rules engine |
