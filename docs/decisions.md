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
| Minimum trading days | **3 days** (confirmed 29 Sept 2026). Matches what's configured on the live challenge type and the Challenge Builder's default for a new evaluation phase (`challenge-type-form.tsx`) — no change needed, this confirms the existing behaviour. Remains editable per challenge type. Was open decision #16 |
| What counts as a trading day | **Any closed trade that calendar day** (confirmed 29 Sept 2026), no minimum trade size. Not yet enforced anywhere — `tradingDays` is still typed in by an admin (deferred-items.md C) until a trading-platform feed exists (decision #4); recorded now so the eventual feed integration is built to this rule rather than guessing. Was open decision #12 |
| Trading-day rollover | **Midnight UTC** (confirmed 29 Sept 2026). Nothing automated depends on this yet (equity is manual until decision #4); recorded now so it isn't re-litigated later. Was open decision #2 |
| Trailing drawdown reference | **End-of-day high-water mark**, per rulebook v1.0 (confirmed 29 Sept 2026) — not the prototypes' intraday-peak behaviour. Not yet observable in practice: `peakEquity` is set directly by whatever an admin types into "Manual override" (`traders.ts`, `updateAccountState`), so there's no live intraday feed yet to be "too strict" against. Matters once the equity feed (decision #4) exists — build the peak update to only apply once per trading day, at close. Was open decision #17 |
| Equity/trading days on phase advance | **Stays a per-advance admin choice** (confirmed 29 Sept 2026) — the existing checkbox on the advance screen (default: reset, audited either way) is correct as built; not being made a fixed, no-choice behaviour. Was open decision #18 |
| Currency | **Euros only** — no plans for a second currency (confirmed 29 Sept 2026). Already how every screen behaves: money is shown in whatever currency is actually configured, never a hardcoded symbol. Was open decision #15 |
| Four-eyes payout approval | **No threshold** (confirmed 29 Sept 2026) — any one admin with payout-approval rights may approve any amount, same as today. Segregation of duties (the KYC reviewer can't approve the same trader's payout) still applies regardless of amount. Revisit if payout volume grows |
| Non-cash prize / grant cost | **Left out of firm statistics** (confirmed 29 Sept 2026) — funded accounts and free challenges given away (competitions, promotions) are not valued or added to reported cost; figures stay exactly what was actually paid or received in cash |
| KYC refresh policy | **No fixed schedule** (confirmed 29 Sept 2026) — a verified trader is not re-checked periodically; re-verification is only triggered by a change of details, a large payout, or something looking wrong. No expiry/reminder mechanism needed. Was open decision #14 |
| Paid-entry competitions | **Cleared for Cyprus** (confirmed 29 Sept 2026) — a paid-entry competition is not blocked by the gaming/lottery concern in spec §7.4. The **per-competition legal sign-off gate stays built and enforced** regardless (a paid competition still can't go active until sign-off is recorded on it) — this decision says the position is fine, not that the record-keeping step should be removed. Was open decision #13 |
| Maximum pass-review period | **2 business days** (confirmed 29 Sept 2026) — an internal service standard, not yet enforced anywhere (no overdue flag is built). Recorded so an "overdue pass review" alert can be built to this number later without re-asking. Was open decision #3 |
| Affiliate programme in V1 | **Yes — settled** (confirmed 29 Sept 2026). Already in real use. Commission stays a flat percentage chosen per affiliate, as built; no tiered or fixed-per-sale model. Was open decision #7 |
| Competition tie-breaker rule | **Stays free text per competition** (confirmed 29 Sept 2026) — no single system-wide rule; different competition formats may need different logic. Staff must still fill it in before a competition can go active (already enforced) |
| Confirmed multiple-account link & payouts | **Stays a staff judgement call** (confirmed 29 Sept 2026) — a confirmed link (same document, card or device) raises a medium risk flag same as an unconfirmed one; it does not auto-escalate to high. Staff must deliberately escalate to hold payouts, to avoid a shared device/household freezing a legitimate trader's money automatically |

## Open: needs a decision

> **Being reviewed 29 Sept 2026 onward**, module flow by module flow, per the founder's request. Decided ones move to the table above with the date. Vendor choices (platform, payment, payout, email, KYC storage, geolocation) are tracked here but reviewed separately as a shopping/status exercise, not a snap decision.

| # | Question | Blocks |
|---|---|---|
| 4 | Trading platform: licence (DXtrade, TradeLocker, Match-Trader, TradeTech) or build | Equity feed, all end-to-end testing |
| 5 | Payment provider and currencies | Orders, refunds, chargebacks |
| 6 | Payout rails / provider | Payouts |
| 8 | Which legal entity holds the customer relationship, under what permission. **Checked in 29 Sept 2026 — still pending legal advice.** | Terms, KYC, payments |
| 9 | Brand name. Trademark clearance (EUIPO) not yet done. **Checked in 29 Sept 2026 — still pending.** | Branding |
| 10 | Revenue recognition of challenge fees (at purchase or deferred) | Finance reporting |
| 11 | Restricted-jurisdiction matrix (sanctions, payment provider rules, data vendor terms, legal advice) | Country controls |
