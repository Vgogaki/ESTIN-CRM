# Prototypes

Three React components built during the design phase. They show the intended screens, workflows and rules-engine behaviour.

**They are reference material, not a starting codebase.** They run entirely in the browser, store data in browser storage, have no server, no real authentication, no audit trail, and use simulated prices. Rebuild each feature properly against `docs/crm-specification.md`; do not copy the storage or state-management approach.

## back-office.jsx

The admin CRM. Sections:

- **Firm statistics:** revenue, payouts, net position, pass rate, competition acquisition metrics.
- **Pending tasks:** derived work queue: rule breaches flagged, ready to pass, pass review, KYC to review, funded without KYC, identity mismatches, breached traders awaiting an offer, pending withdrawals.
- **Traders:** person-level list (one row per email) with account pills. Detail drawer has account tabs, live rule meters, status/phase/KYC controls, payouts, notes, void-with-reason, identity-mismatch banner.
- **Withdrawals:** queue with approve/decline gated on KYC, CSV export.
- **Competitions:** configuration, prize ladder, leaderboard with minimum-trades qualifier, entrant conversion tracking.
- **Offers:** discount campaigns, "ready to send" list of breached traders, issued-offer tracking and take-up.
- **Challenge types:** rule templates (single-phase only in the prototype; V1 needs multi-phase and versioning).
- **Integrations:** API contract and an order-webhook simulator.

## trader-portal.jsx

Trader-facing portal: login (email lookup only), dashboard with objective meters and equity curve, my plans with phase stepper, payouts, competitions.

**Known gap:** still uses the older per-account model. V1 must use the person-with-accounts model from the back office.

## trading-terminal.jsx

Simulated trading terminal: six instruments on a random-walk price feed, market orders with stop loss and take profit, open positions, live rule enforcement that liquidates and closes the account on breach and routes to pass review on target.

Demonstrates the equity feed → rules engine → CRM status loop. **Not for production:** prices are synthetic, P&L maths is simplified to USD accounts, and there is no margin or leverage check. V1 uses a licensed platform or feed.

## Known limitations across all three

- Browser storage only; it fails on some mobile devices.
- Amounts shown in $; business prices are in €.
- No authentication, roles or audit log.
- Floating-point money maths. V1 must use decimals.
