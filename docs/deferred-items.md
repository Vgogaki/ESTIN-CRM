# Deferred items — things not built, and why

A running list of what was **not** built, or only partly built, so it can be
revisited deliberately. Each item says what's missing, why, and what unblocks
it. Kept separate from `v1-build-plan.md` (which tracks module status) so
nothing gets lost inside a long status note.

Last updated: 26 September 2026.

**Legend for "blocked by":** *Decision* = needs a founder/legal answer.
*Vendor* = needs a provider chosen. *Platform* = needs the trading platform
(3.3). *Build* = just hasn't been built yet, nothing external in the way.

---

## A. Important gaps in already-"built" modules

These are the ones most worth looking at first.

| # | Gap | Effect today | Blocked by |
|---|---|---|---|
| A1 | ~~No action to advance an account to its next challenge phase.~~ **Fixed 26 Sept 2026** — see build plan 3.8. Remaining: what happens to equity on advancing is open decision #18 (built as an audited reset-by-default choice); there is no "reject the pass" action (an admin closes the account by hand); pass-review service level / maximum period (decision #3) is not enforced. | Payouts now work end to end for an account advanced to funded. | Decision |
| A2 | **Nothing ever sets `marketingConsent`.** The field exists, offers respect it, but no sign-up checkbox, portal setting or unsubscribe exists. | Offer notifications are never sent to any real trader (spec: marketing only to consenting traders). | Build |
| A3 | **GDPR erasure of a person is not built.** Only individual KYC documents can be erased. The schema comment references `src/server/gdpr.ts`, which doesn't exist. | The CLAUDE.md rule "GDPR erasure anonymises personal data while keeping the financial record" is only partly met. | Build |
| A4 | **Webhooks are not signed/verified — no webhook endpoints exist.** CLAUDE.md requires signed webhooks. `POST /api/v1/orders` is guarded by one shared API key, not a signature. | Fine while there's no payment provider; must be redone when one is chosen. | Vendor (payment provider) |
| A5 | **No audit-log viewer and no admin-user/role management screen.** Permissions `auditLog.view` and `admins.manage` exist; nothing uses them. | The audit trail is real and immutable but can only be read via the database. New admins can only be created by script. | Build |
| A6 | **Single shared API key** for the order API instead of per-integration keys (spec §5.7). | Acceptable for one checkout; not for several integrations. | Build |
| A7 | **No trader self-service for competitions or offers.** Admins add competition entrants by hand and record the entry fee paid by hand; a trader only *sees* an offer as a notification. | Works for testing and manual operation, not as a self-serve channel. | Build (entry payment: Vendor) |

## B. Country controls (6.3)

- **IP geolocation** — no geolocation provider, so IP isn't checked. *Vendor.*
- **KYC-document country** — KYC stores documents but no separate structured country field. *Build.*
- **What is checked today** — only the country given at registration or on the order, which also serves as the billing country.
- **Trading-stage rules** — can be saved, but can't be enforced until there's a trading platform. *Platform.*
- **The list is empty** — which countries belong on it is a legal/business call (decision #11). *Decision.*
- **Blocked purchases can arrive after payment** — checkout must call `GET /api/v1/country-check` first; until there's a refund flow (2.3) a blocked order that was already paid has no automated remedy. *Vendor.*

## C. Blocked on the trading platform (3.2 / 3.3)

- **Equity feed** — all equity today is typed in by an admin ("Manual override"). Everything that "runs automatically" runs off that.
- **Equity curve with target/breach lines** on the trader dashboard (spec §6.1) — no tick history to chart.
- **Payout "consistency rule" check** (best day ≤ 50% of profit) — needs per-day equity history.
- **Trading-day counting and day rollover** — `tradingDays` is manual (decisions #2 and #12 also open).
- **Instrument restrictions (3.6)** — enforced platform-side.
- **Real trade counts in competitions** — entrant equity and trade counts are simulated by an admin.

## D. Blocked on a vendor choice

- **Payment provider (2.2)** and **refunds / chargebacks (2.3)** — decision #5.
- **Payout rails (5.3)** — decision #6. Consequence: a payout can be approved but never marked *paid*; that status is deliberately unreachable so nobody can record money as sent that wasn't. `Withdrawal.providerReference` is ready for it.
- **Transactional email (4.5)** — verification links, password resets and notifications are console logs / in-app only.
- **KYC document storage backend** — currently encrypted files on local disk (`.kyc-storage/`); needs object storage before production. Retention/refresh policy is decision #14.

## E. Needs a decision, not code

- **Competition tie-breaker rule** (spec §7.2 "must be defined before launch") — today free text per competition, nothing auto-applied.
- **Paid-entry competitions** — legal position in Cyprus (decision #13); gated behind a recorded legal sign-off.
- **Four-eyes payout approval above a threshold** — optional in the spec, no threshold decided, not built.
- **Non-cash prize cost** — funded accounts / free challenges have a real cost that isn't valued; firm stats sum cash prizes only.
- **Terms/rulebook** — a placeholder version string is recorded (`v0.1-draft`) until legal drafts the real document (decision #9).
- **Currency** — firm statistics sum in one currency; revisit if a second is ever sold (decision #15 is about display).
- **Trailing-drawdown reference and minimum trading days** — decisions #16 and #17.

## F. Smaller notification gaps

- "Account **expiring soon**" (the spec lists it alongside "expired") — only "expired" fires; a warning needs de-duplication so it doesn't repeat every sweep.
- No notifications for risk notices or general system messages; no admin composer for them.
- Offers: no trader-facing "my offers" page.

## G. Engineering / quality

- **Playwright end-to-end tests** are in the agreed stack but not set up. Verification so far is unit tests (rules, expiry, payouts, offers, competitions, countries, challenge versioning) plus manual live checks; there is no automated browser suite.
- **No CI** — deliberately left to whoever sets up hosting.
- **2FA** has no disable/recovery-code flow.
- **Dev-only friction on this machine:** Prisma's migration engine is blocked by Windows Application Control, so migrations run through Docker (see `dev-environment-notes.md`). The dev server also needs a restart after every `prisma generate`.
- **Production hosting, secrets, backups, monitoring** — the contractor's Foundation Setup (`deployment.md`). The database user needs privileges to create pg-boss's own schema.
- **Independent security review** before real customer data (build plan Part 1).

## H. Modules not started (for completeness)

4.6 Support/messaging · 5.5 Finance reporting & export · 6.1 Multiple-account detection · 6.4 Jurisdiction matrix (business task) · 6.5 KYC-country vs IP mismatch · 6.6–6.8 Device fingerprinting / risk profiles / copy-trading detection · 7.3 User 360 · 7.4 Affiliates · 7.5 Training content.
