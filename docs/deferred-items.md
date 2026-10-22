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

> **Decision review:** the founder has asked that all pending decisions (section E, the open items in `decisions.md`, and #18) be left open until the system is complete, then reviewed together one by one for every module flow.

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
| A8 | **Competing actions — fixed for payouts, advance, override, void and expiry (13 Oct 2026); not fixed or not reviewed elsewhere.** Fixed: see technical-requirements §6. Still open: (a) a risk flag or country review created in the same few milliseconds as a payout approval is not serialised with it (the approval re-checks them inside its transaction, which narrows the window to milliseconds but does not close it); (b) order intake creates the person before the account/payment transaction, so a failure between them leaves a person with no account (harmless, a replay reuses the person); (c) the `before` value in the KYC-status audit entry is read outside a lock; (d) offers, competitions, affiliate commissions, support and other modules were **not** reviewed for concurrency; (e) no retry/backoff/dead-letter settings on the background jobs, and no operator view of failed jobs (a single failing account no longer stops the rest of the expiry sweep; it is logged and retried next run). | Normal single-user operation is unaffected. Remaining items only matter under simultaneous use. | Build |
| A9 | **Approving a payout does not re-check the account itself.** A payout is requested only on a funded, active, unvoided account, but at *approval* the account's current state is not checked: if the account was breached, closed or voided in between, the approval still goes through. **Needs a decision** (should approval be blocked, or auto-declined, when the account is no longer funded and active?). Not changed because it alters a money rule. | A pending payout on an account that has since breached can be approved by mistake. | Decision |
| A10 | **FIXED 22 Oct 2026 (see B9c): a new buyer is emailed a set-a-password link, and any emailed reset link now confirms the email.** Original gap: a trader created by an order (checkout or the Test tools) had no way to get a working login. Such a person has no password and no verified email. Registering with that email is refused ("already exists"). "Forgot password" does let them set a password, but resetting a password does not mark the email verified, and the only verification email is sent at registration, so login then fails with "Please verify your email". There is also no back-office way to create a trader, send a portal invite, or mark an email verified (affiliates do have "Resend portal invite"). Found 20 Oct 2026 from reading the code; not yet reproduced live. Likely fix: a staff "send portal invite" action, and treating a completed emailed reset link as proof of the mailbox. That changes sign-in behaviour, so it needs the founder's go-ahead. | Every real customer who buys through checkout would hit this. Workaround on the review copy: register a fresh email at /portal/register. | Build (decision on approach) |
| A7 | **No trader self-service for competitions or offers.** Admins add competition entrants by hand and record the entry fee paid by hand; a trader only *sees* an offer as a notification. | Works for testing and manual operation, not as a self-serve channel. | Build (entry payment: Vendor) |

## B. Country controls (6.3)

- **IP geolocation** — a driver now exists (`src/server/geoip.ts`, module 6.5), but no provider is configured, so purchase/registration country checks here still use only the declared country. Once `GEOIP_DRIVER`/`GEOIP_API_URL` are set, wiring the resolved country into `enforceCountry`'s checks is a follow-up, not done yet (6.5 only uses it for the login-pattern flag, not for blocking). *Vendor.*
- **KYC-document country** — KYC stores documents but no separate structured country field. *Build.*
- **What is checked today** — only the country given at registration or on the order, which also serves as the billing country.
- **Trading-stage rules** — can be saved, but can't be enforced until there's a trading platform. *Platform.*
- **The list is empty** — which countries belong on it is a legal/business call (decision #11). *Decision.*
- **Blocked purchases can arrive after payment** — checkout must call `GET /api/v1/country-check` first; until there's a refund flow (2.3) a blocked order that was already paid has no automated remedy. *Vendor.*

## B2. Multiple-account detection (6.1)

- **Device linking** — built in 6.6 as a cookie-based device id (see B10); true fingerprinting is not.
- **Address linking** — no address is collected anywhere; needs a field on the person or on KYC. *Decision + Build.*
- **Payment-instrument linking** works but stays empty until a payment provider supplies a fingerprint token. *Vendor.*
- **Whether a confirmed link should affect payouts** — decided (decisions.md, 29 Sept 2026): stays a staff judgement call. A confirmed link raises the same medium flag as an unconfirmed one; staff must deliberately escalate to high to hold payouts.
- IP linking is deliberately weak and never queued on its own; any threshold for "many people on one IP" is undecided.

## B3. Finance (5.5)

- **Refunds and chargebacks** — reported as "not tracked"; needs module 2.3 and a stored refund amount. *Vendor (payment provider).*
- **Revenue recognition** — decided (decisions.md, 29 Sept 2026): at purchase, no deferral. Figures are cash received.
- **Paid vs approved payouts** — needs a payout provider. *Vendor.*
- Single-currency firm statistics on the dashboard vs. per-currency here — moot now euros-only is confirmed (decisions.md), but the dashboard and finance page still differ mechanically if that ever changes.
- No scheduled/emailed reports, no accounting-package format (only generic CSV).

## C. Blocked on the trading platform (3.2 / 3.3)

- **Equity feed** — all equity today is typed in by an admin ("Manual override"). Everything that "runs automatically" runs off that.
- **Equity curve with target/breach lines** on the trader dashboard (spec §6.1) — no tick history to chart.
- **Payout "consistency rule" check** (best day ≤ 50% of profit) — needs per-day equity history.
- **Trading-day counting and day rollover** — `tradingDays` is manual. The rule to build to is decided (decisions.md: any closed trade counts, rollover at midnight UTC); just needs an equity feed to enforce it against.
- **Instrument restrictions (3.6)** — enforced platform-side.
- **Real trade counts in competitions** — entrant equity and trade counts are simulated by an admin.

## D. Blocked on a vendor choice

- **Payment provider (2.2)** and **refunds / chargebacks (2.3)** — decision #5.
- **Payout rails (5.3)** — decision #6. Consequence: a payout can be approved but never marked *paid*; that status is deliberately unreachable so nobody can record money as sent that wasn't. `Withdrawal.providerReference` is ready for it.
- **Choosing the email provider (4.5)** — the email system is built and verified against a test SMTP server, but until a provider is chosen and its `EMAIL_DRIVER=smtp`, `SMTP_URL`, `EMAIL_FROM` settings are filled in, nothing is delivered (messages are recorded and printed to the server log). Also needs the sending domain's SPF/DKIM/DMARC set up for deliverability, which only the domain owner / contractor can do.
- **KYC document storage backend** — currently encrypted files on local disk (`.kyc-storage/`); needs object storage before production. Refresh policy is decided (decisions.md: no fixed schedule) — retention/deletion timing (how long to keep a document after a person leaves) is separate and still open.

## E. Needs a decision, not code

- **Competition tie-breaker rule** — decided (decisions.md, 29 Sept 2026) to stay free text per competition, filled in before it can go active (already enforced); no single system-wide rule.
- **Paid-entry competitions** — legal position confirmed clear for Cyprus (decisions.md, 29 Sept 2026); the per-competition legal sign-off gate stays built and enforced regardless.
- **Four-eyes payout approval above a threshold** — decided against for now (decisions.md, 29 Sept 2026): no threshold, single-admin approval, revisit if volume grows.
- **Non-cash prize cost** — decided to leave out of firm statistics for now (decisions.md, 29 Sept 2026): funded accounts / free challenges stay unvalued; figures are cash only.
- **Terms/rulebook** — a placeholder version string is recorded (`v0.1-draft`) until legal drafts the real document (decision #9).
- **Currency** — firm statistics sum in one currency; revisit if a second is ever sold (decision #15 is about display).

## F. Smaller notification gaps

- "Account **expiring soon**" (the spec lists it alongside "expired") — only "expired" fires; a warning needs de-duplication so it doesn't repeat every sweep.
- No notifications for risk notices or general system messages; no admin composer for them.
- Offers: no trader-facing "my offers" page.

## G. Engineering / quality

- **Playwright end-to-end tests** are in the agreed stack but not set up. Verification so far is unit tests (rules, expiry, payouts, offers, competitions, countries, challenge versioning) plus manual live checks; there is no automated browser suite.
- **Database tests exist** (`npm run test:db`, added 13 Oct 2026): `src/server/concurrency.db.test.ts` builds a throwaway database from the migration files and fires competing actions at it. They are not part of `npm test` (which needs no database), so whoever sets up CI must run both. They refuse to run against a non-local database. One migration (`20261013150000_one_pending_withdrawal_per_account`) is a partial unique index that Prisma's schema file cannot express; Prisma does not report it as drift, but it lives only in the migration SQL.
- **No CI** — deliberately left to whoever sets up hosting.
- **Admin 2FA built 9 Oct 2026** (`/admin/account`): setup with an authenticator app, 10 one-time recovery codes (hashed, shown once), turning it off or regenerating codes needs password + a current code, wrong codes count toward lockout, all audited. Still open: **not mandatory for staff** (should be before real customer data); the authenticator secret is stored **unencrypted** (admins and traders); no replay protection within a code's 30-second window; **traders still have no disable/recovery-code flow**; no QR code (key is typed in manually, to avoid a new dependency).
- **Hosting hardening still open** (found while preparing the review copy, `hosting-review.md`): no Content-Security-Policy; the client IP is read from the first `X-Forwarded-For` value, which a visitor can influence behind a proxy (trust only the platform's proxy in production); fonts are fetched from Google at build time (a one-off failure fails the deploy; bundle them to remove it); no rate limiting beyond the per-account lockout; the admin "Test tools" page must not exist in production.
- **Dev-only friction on this machine:** Prisma's migration engine is blocked by Windows Application Control, so migrations run through Docker (see `dev-environment-notes.md`). The dev server also needs a restart after every `prisma generate`.
- **Production hosting, secrets, backups, monitoring** — the contractor's Foundation Setup (`deployment.md`). The database user needs privileges to create pg-boss's own schema.
- **Independent security review** before real customer data (build plan Part 1).

## B4. Support / messaging (4.6)

- Staff replies are emailed to the trader (4.5), but a trader's own email reply is not read back into the thread; they must reply in the portal.
- Threads and the trader profile (7.3) link to each other.
- **No rate limiting** on new threads or messages (a trader could flood support).
- Attachments share the KYC encrypted store (`.kyc-storage/`); no virus scanning.
- No assignment of a thread to a specific staff member, and no staff-only internal notes on a thread.

## B5. Email (4.5)

- **Delivery-status tracking**: "sent" means the provider accepted the message. Bounces, spam complaints and opens are not fed back (needs the provider's webhooks, so it waits for the vendor choice).
- **No email for events that have no trigger yet**: "account expiring soon" and risk / general system notices (see F), "payout paid" (5.3 blocked), "KYC requested".
- Templates are plain text (rendered as simple HTML with clickable links); no branded HTML layout or logo.
- Templates are English only.
- Marketing consent is a single opt-in (registration box or the toggle on the trader's Notifications page). Existing traders start opted out. There is no consent history beyond the audit log, and the wording of the checkbox is for legal to approve.
- Admin edits to a template apply to emails queued afterwards; there is no preview or version history (the audit log keeps the before and after text).
- Verification and password-reset tokens are still returned by the register API for testing convenience and appear in the `console` driver's log output; both should be reviewed before production.

## B6. Jurisdiction matrix (6.4)

- **The country list itself is still empty and is not a development task.** It needs four inputs from outside the team (sanctions/legal, payment provider, data vendor, Cyprus marketing advice). The Countries page now tracks each, but someone has to obtain them and then enter the resulting rows.
- The tracker is informational: "settled" doesn't block a launch or change any rule, and there is no automatic check that the entered country rows match what the four sources said.
- Per-country evidence (which source blocked which country) is only the free-text note on each rule; there is no structured link between a rule and the input behind it.

## B7. User 360 (7.3)

- **Refunds and chargebacks** aren't on the profile because 2.3 isn't built (payment provider undecided).
- Risk flags now exist (6.7) and show on the profile's Risk profile card.
- The profile is one long page, not tabs; the audit trail is capped at the latest 100 entries with no filtering or export.
- KYC documents are shown as before (view restricted by `kyc.view`); no separate KYC history timeline beyond the audit trail.

## B8. Training content (7.5)

- **No launch content is written.** The library starts empty; the articles (platform guides, risk management, education) need to be written, and reviewed so nothing reads as personal investment advice. The disclaimer wording is a draft for legal review.
- Article text is plain text (paragraphs and links); no images, headings, embedded video or rich formatting. Video is a link that opens in a new tab.
- The generated rules explanation doesn't describe the consistency rule (the engine doesn't enforce one yet); it only notes that one applies. It shows only live (on-sale) challenges, not the version an existing trader bought, and English only.
- No read tracking, search, categories beyond the four sections, or "required reading" gating.
- Articles have no version history beyond the audit log's before/after.

## B9. Affiliates (7.4)

- **Decision #7 settled 29 Sept 2026**: affiliates are in V1 (already in real use), commission stays a flat percentage per affiliate (no default rate). Tiered or per-sale-fixed models, and a holding period before commission can be approved, aren't built.
- **Automatic clawback on refund or chargeback** waits for 2.3 (payment provider). Until then staff void a commission by hand, and **a commission already paid can't be reversed in the system** (money owed back would need to be tracked outside it, or netted against the next commission).
- **Affiliate portal built** — its own login at `/affiliate`, separate from a trader account (founder's decision: open to outside partners, not only existing traders). An affiliate sees their code, rate, totals and referred-purchase ledger; fraud-detection reasoning (the `flag` text, staff review notes) is deliberately withheld from their own view. No 2FA (unlike the trader portal) — lower risk since the portal is view-only and holds no payment rail details; revisit if affiliates ever get more than a read-only view.
- **No payout to affiliates**: rails aren't chosen (decision #6), so "paid" is a manual record with a reference, not a transfer. There is no batching, statement, tax or invoice handling, and the portal doesn't collect bank details.
- **Referral codes and introduced traders built 20 Oct 2026** (founder's decisions): nobody types a code; the affiliate presses Generate in their portal and the system creates `EST-XXXXXXXX` (one active code each, enforced by a database index). The back office shows every code with who made it and when, and staff can deactivate one with a reason (it stays on record and is never reissued; the affiliate can then generate a replacement). Existing staff-typed codes were carried over and are marked "legacy". A code that is not in the register earns nothing and is logged. The affiliate can record a person (name + email) and share their link `/portal/register?ref=CODE`; the person is matched when that email registers or buys. ESTIN does not email the introduced person. One introducer per trader, **first wins**; commission is unchanged: only on orders that carry the affiliate's own code. The affiliate sees first name, masked email and a four-step stage (not signed up / registered / bought / funded) and nothing about performance, KYC or payouts; staff see the full record. Recording an email never reveals whether it is already a customer (a person who already exists never matches a later recording).
  Still open: **the link only works on the portal's own sign-up page.** There is still no click tracking and no landing/marketing-site link; checkout must send `affiliate_code` with the order. An introduced person who exists already and is later "added" is never matched unless they use the code themselves. No email goes to the affiliate when someone they introduced registers or buys. No limit on how long an introduction lasts (decision needed). The introduced-trader stage reflects the person's purchases and funded accounts whether or not they used the code, so an affiliate can see a stage change on a purchase that earned them no commission. Not reviewed by a lawyer: what an affiliate may be shown about a trader, and recording someone's name and email without their knowledge, need a privacy review before launch.
- Commission is calculated on the amount paid in the order's own currency; there is no currency conversion, and no per-challenge exclusions.
- Self-referral detection is a heuristic (own profile, same email, same card). It won't catch an affiliate buying for a friend with a different card, and it needs the affiliate to be linked to a trader profile for the profile and card checks.
- No email notification to the affiliate when a commission is approved, paid or voided — they only see the current state next time they sign in.

## B9d. Trading terminal: price service and trading engine (3.2 / 3.3)

**Built 23 Oct 2026, foundation only.** The founder chose to explore building ESTIN's own simulated terminal (the "build" side of open decision #4). What exists, all in `src/server/trading/`, all tested (75 unit and 31 database tests), none of it connected to a screen, an API route or the challenge rules yet:

- **Price service** (`price-service.ts`, `providers.ts`, `quote-filter.ts`). Prices come from a provider (`PRICE_DRIVER=tradermade` real, or `simulated`; unset = nothing runs, which is the default everywhere). **Every price received is stored** in an append-only table (`PriceTick`; the database refuses edits and deletes) so any dispute can be checked against the record. Only trusted prices are used: zero, crossed, or too-wide-spread prices are rejected; a price that jumps more than the instrument's limit is **held as a suspect until the next price agrees** (so a single bad tick can never stop a trader out; a real move costs one tick of delay). A price older than 15 s is **not current**: trading and stops are refused rather than using an old price. Unchanged prices are stored only as a 5-second heartbeat. Several copies of the app can run it at once (a database lock; duplicates ignored).
- **Trading engine** (`engine.ts`, `fx.ts`, `market-hours.ts`, `instruments.ts`): pure Decimal maths, tested at the cent: buy at the ask / sell at the bid, profit converted from the instrument's currency (USD, JPY, GBP) to the account currency (EUR) through the live major pairs (refuses to guess a missing rate), margin = position value / leverage (the lower of the challenge's cap and the instrument's limit; rounded UP), lot size and step limits, stop-loss / take-profit placement checks, equity = balance + floating profit, stop and target triggers (a long on the bid, a short on the ask), and a stop **fills at the price that triggered it** (so a gap through a stop gives the worse price, as on any platform).
- **Orchestration** (`trading.ts`): open a market order, close a position, close all positions on an account, process stops, read an account's live snapshot. Each runs under the account's row lock (the same one payouts use) and writes balance, position and audit entry together. Every fill records the **id of the exact stored price** it used. Orders are checked against the challenge's permitted-instruments list (**deny by default: an empty list permits nothing**), the account's state (active, evaluation or funded, not voided), market hours and margin.
- **Instruments** are a table (`Instrument`), seeded with EURUSD, GBPUSD, USDJPY, XAUUSD, US30, UK100; staff-editable in the database, never overwritten by the seed.
- A command-line demo (`scripts/terminal-demo.ts`, refuses to run against anything but a throwaway database) shows the whole loop.

**Two real bugs were caught by the tests while building this** (both fixed): the price-lock statement could not be read back by the database client (every real poll would have failed), and a duplicate price inside a transaction aborted the rest of the batch.

**Placeholders and open decisions this was built around (all need your confirmation before real use):**
1. **Every instrument number is a placeholder:** lot limits, maximum leverage (all 1:100), minimum stop distance, bad-price thresholds, and **trading hours** (approximate; must be checked against TraderMade's `market_opening_times`, including daylight saving).
2. **Weekend holding, overnight swap charges, news-trading and other restrictions: not decided, not enforced.** Positions can currently be held over a weekend and cost nothing to hold.
3. **What happens to open trades during a price outage:** today nothing is closed or breached on stale data (stops are skipped). When the rules link is built, breach checks must also freeze on stale prices; that policy needs your sign-off.
4. **Costs:** spread is the provider's bid/ask as received (no ESTIN markup) and commission is zero. A markup or commission is a business choice.
5. **Stop fills at the triggering price (market), not the level set.** Say if you want "at the level" instead.
6. **Bad-price policy:** one extra price of delay on a real large move (including the weekend gap). Thresholds per instrument are placeholders.

**Rules link built 24 Oct 2026** (`account-link.ts`, `day.ts`, `consistency.ts`). For every account that trades in the terminal, on every price update (and straight after each order or close), under the account's row lock in one transaction:
- **Equity** = balance + floating profit at the current prices, written to `Account.equity`; an equity-curve point (`EquityTick`) at most once a minute. **If a price needed to value the account is not current, nothing changes** (equity stays at its last value; no breach can be declared on stale data).
- **Daily reset at midnight UTC** (decided 29 Sept): day-start equity becomes the previous day's last equity, and the trailing high-water mark rises to the best END-OF-DAY equity, never an intraday high (decided: end-of-day high-water mark). Once per UTC day (`lastRolloverOn`); applied on the first look after midnight, from the last stored equity.
- **Rules** use the same `evaluateAccount` / `determineAutoTransition` as the back office. A breached daily or maximum loss limit **closes every position at the current prices and closes the account as breached**; an evaluation account that reaches the profit target (with the minimum trading days done) **closes every position and moves to pass review**. The trader is notified; everything is audited (`account.auto_breached`, `account.auto_pass_review`, `account.day_rollover`).
- **Funded accounts are now checked against their loss limits too** (before this only evaluation accounts were, which was the reviewer's finding).
- **Trading days:** a UTC day on which at least one trade was closed counts once (`tradingDays`, `lastTradingDayOn`), as decided.
- **Staff can no longer type equity, day-start equity, high-water mark or trading days into an account that has traded in the terminal** (it would be overwritten on the next price). Status and phase can still be changed. Accounts that never traded are unaffected.
- **Best-day consistency rule enforced at payout request** where the phase has `{"type":"best_day","maxPct":50}` in its consistency rule and the account has closed trades since the phase began: refused with the figures if the best day is more than the limit of the profit on profitable days. **Not applied where there are no trades to look at** (accounts run by hand), and there is **no screen to set the rule** yet (it is a JSON field on the phase).

**Placeholders and decisions this adds (please confirm):**
1. **Passing flattens:** reaching the target closes all open positions at the current prices before moving to pass review. Other firms differ; say if you want the pass to wait until positions are closed.
2. **A funded breach closes the account, and any payout already pending on it is NOT touched** (the same gap as A9: a payout can still be approved on a breached account until that is decided).
3. **Outage policy = freeze** (no equity update, no breach, stops skipped) while prices are not current. A trader whose position is losing during an outage is not stopped out until prices return, and then at the first price seen.
4. **Breach is detected at the first price the system sees past the limit**, and the account closes at that price. With polling every 2 s a fast move can end below the limit (the demo shows 8,472 lost against a 5,000 limit after a 15-pip jump between polls). The same happens on any platform; streaming prices narrow the window.
5. **The daily reset uses the last stored equity,** not a recalculation at midnight. If the price service was down across midnight, the reset is applied from the equity as last recorded.
6. **Consistency: the days counted** are the UTC days of the current phase's closed trades, a day's profit is after commission, and loss-making days are ignored in the total. All placeholders.
7. **Scale:** each price update looks at every account that has open positions, one after another. Fine for hundreds; thousands of simultaneously open accounts would need batching.
8. **Only accounts that have traded in the terminal are processed.** An account run by hand still has its equity typed in and its day-start never reset automatically, as before.
**Trader terminal screen built 25 Oct 2026** (`/portal/terminal`, `terminal.ts`, routes under `/api/portal/terminal/`). A signed-in trader picks one of their tradable accounts (active, evaluation or funded) and sees: a watchlist (bid, ask, today's move, market open/closed) for the instruments their challenge permits; a candlestick chart (1, 5, 15 min and 1 hour) **built from ESTIN's own stored prices**, with their entry, stop and target lines; an order ticket (size, optional stop-loss and take-profit, buy at the ask / sell at the bid); open positions with live profit and a Close button; trade history; and live equity, balance, floating profit, margin and the challenge's rule meters. Everything is worked out on the server and polled about once a second; **an order carries only what to trade and how much, never a price**, and the server's refusal message (market closed, no current price, not enough margin, size, stop placement, instrument not permitted) is shown as given. Every route requires a signed-in trader and checks the account is theirs (tested; unsigned requests get 401). A banner says when prices are simulated, when they are not current (trading paused, nothing is marked or stopped out), and when the price service is not switched on at all.
- **Verified in a browser** on a throwaway copy with the simulated feed: prices updating, a buy filled at the ask with a stop and target, a refused oversized order showing the server's message, live equity and margin, a close at the current price, the balance changing by exactly the profit, the trading day counted, and the history. There is **no automated browser test** (the data layer behind it has 11 database tests).
- **To try it locally:** the price service is off by default, so the terminal says prices are not switched on. Add `PRICE_DRIVER=simulated` to `.env` and restart the server. **Caution: while it runs it stores roughly three prices a second, for ever** (the price table is append-only and cannot be trimmed), so leave it on only while testing, or set `PRICE_POLL_MS=5000` to slow it.
- **Editing stops and the back-office view built next.** *Trader:* an **Edit** button on each open position lets the trader change or remove its stop-loss and take-profit (an empty box removes that level). The server checks a new level against the price the position **would close at right now** (not where it was opened), so a level on the wrong side, inside the instrument's minimum distance, or that would fire at once is refused with a message; moving a stop to lock in profit is allowed. It runs under the same account lock as closes and stops, so a change racing a close or a stop being hit cannot both win (the later one is told the position is already closed); each change is audited with before and after. *Back office:* a **Terminal trading** card on the trader's page (anyone who can view traders) shows each account that has traded: balance, live equity, floating profit, open positions with live profit, and the latest 25 closed trades. A **Force close** button needs the new permission **`trading.forceClose`** (given to the super admin and Operations roles, not Support, Compliance or Finance; the founder can change this) and a **written reason of at least five characters**; it closes at the current price exactly as the trader's own close would (balance, trading day and rules are updated the same way) and the audit entry records the staff member, the reason, the stored price used and the balance before and after. It is refused rather than guessed when there is no current price. Server-side permission was checked from the browser as a Support user (403). Not built: staff cannot edit a trader's stops; the card is a snapshot (reload to refresh); no list of all open positions across traders, and no close-all button.
- **Missing, in rough order of importance:** pending orders (limit and stop orders); closing part of a position; a margin and risk preview before ordering; an order confirmation (orders are one click, closes ask first); a mobile-tuned layout (it stacks on a narrow screen but is not designed for a phone); keyboard shortcuts; sound or on-screen notice when a stop or breach closes a trade (the position simply disappears and a notification is sent).
- **Scale:** each open terminal asks the server for its state once a second (about six queries each). Fine for tens of traders at once; hundreds would call for pushing prices (server-sent events or a socket) instead of polling.
**Not built yet (the next steps):**
- **(Built 24 Oct 2026, see below.)** Still true: **no screen, API route or back-office page calls any of this**, so it cannot affect an account until a screen or the price service is switched on.
- A price-service health page (the trader terminal screen and the back-office positions view with force-close are built, above).
- **Streaming prices.** This polls TraderMade's REST `/live` every 2 s; a stop can be reached and passed within that window. Real-time streaming needs TraderMade's WebSocket details (not in the file received).
- **To confirm with TraderMade before relying on it:** that the plan and licence allow a simulated prop-firm product, showing prices to customers, and storing them; the rate limit for polling every 2 s; that `US30` (and each other symbol) exists under that name on the plan; uptime.
- **Single price source:** one provider, no cross-check against a second. A bad but self-consistent feed would pass the filter.
- **Storage growth:** every price is kept for ever (append-only). Roughly a quarter of a million rows a day at full activity; partitioning or a retention decision will be needed.
- **Monitoring:** no alert if prices stop arriving (the failure is logged, sparingly, and trading simply stops).

## B9c. Buying a challenge in the portal (2.1 from the inside)

- **Built 22 Oct 2026** (founder's decisions): a signed-in trader opens **Buy a challenge** (`/portal/buy`), sees every challenge on sale, reads the rules (generated from the live settings), accepts the terms, and pays. The **price is worked out on the server** (the browser never sends one) and the challenge version is pinned to the one shown. Their own outstanding offer applies automatically and is used up once; an optional referral code follows the first-introducer rule. A blocked country is refused before payment. Payment then runs through a driver and the **same order path the website uses** (`createOrder`, idempotent on the order reference), so a double click or a retry can never create a second account or payment. Table `CheckoutSession` holds the pending order (30-minute window). Everything is audited (`checkout.started`, `checkout.completed`).
- **No real payment yet (decision #5 still open).** `PAYMENT_DRIVER` unset = purchases switched off (the safe default and what a live system must run). `PAYMENT_DRIVER=demo` = a clearly labelled **simulated** payment, no money moves, for the local and review copies only (set in `render.yaml` for the review copy; remove it before any real launch). A real provider is a third driver: hosted payment page plus a **signed webhook** to confirm it, not built because no provider is chosen. **Until then `completeCheckout` trusts the demo driver; with a real provider it must only ever run from a verified webhook.**
- **No account limit decided:** `MAX_ACTIVE_ACCOUNTS` (unset = no limit) caps active/pass-review/funded accounts per trader. Two checkouts paid at the same instant can exceed it by one (advisory, not a hard guarantee).
- **Not built:** VAT/sales tax (no tax model at all: the price is the fee); refunds and chargebacks (module 2.3); receipts/invoices; a failed-payment state and retries (the demo driver cannot fail); saved payment methods; a staff view of checkouts (the Payment and account records appear as usual, and the audit log has the steps); gift or buying for someone else.
- **Website buyers now get portal access:** an order that creates a new person (the website, `POST /api/v1/orders`) emails them a link to set a password. The link lasts 7 days, works once, and also confirms their email address. **This closes A10.** It also means any emailed password-reset link now confirms the email (the link only reaches the mailbox owner). Until a real email provider is connected the email is only recorded (Back office > Email).
- **Pass the buyer's name exactly:** an order for an existing email with a different name flags an identity mismatch (existing rule). The portal always uses the trader's own name, so it never triggers it.

## B9b. Tasks (3.7)

- **Built 21 Oct 2026** (`/admin/tasks`, table `StaffTask`): Pending / Under review / Completed. The work is still found automatically; each item gets a status. "Start review" assigns it to the person who clicked (one person only; a second click at the same moment is told who has it); "Put back" returns it. The number beside Tasks is the pending count. Taking and putting back are audited; so is automatic completion.
- **A task is completed only by the system, when the situation behind it is resolved** (KYC decided, payout decided, account advanced, support replied...). There is deliberately no "mark done" button: it would let a task show as done while its problem is still there, and the next scan would just recreate it. Say if you want a manual "dismiss with a reason" for the cases where staff decide something needs no action.
- **The list refreshes when someone opens a back-office page** (at most every few seconds), not in the background. If nobody is signed in, tasks are not created or completed until someone is. A background job would remove this; not needed while staff are using the system.
- A task's age is "waiting since the system first noticed it", not since the underlying event happened.
- **Completed shows who was reviewing it, not who resolved it** (the resolving action may be by someone else, or by the trader). Completed keeps the 200 most recent on screen; older ones stay in the database.
- No assignment to a named person other than yourself, no due dates, no notification when a task appears, and no search or filter by type yet. Anyone with a role that can act on something (edit traders, decide KYC, approve payouts, risk, support, countries) can take a task; the read-only role can look only.
- Fixed with this work: an account in pass review whose status had been set to "passed" (by the demo data, or by hand) could not be advanced ("Only an active account can be advanced"). It can now, and advancing sets the status back to active. The task text "Awaiting verification" (which had nothing to do with KYC) was replaced with the real reason, e.g. "KYC (not started) must be verified before funding".

## B10. Device recognition (6.6)

- **Not a true fingerprint.** It recognises a browser by a cookie we set. A determined person defeats it by clearing cookies, using a private window, another browser or another device. A commercial fingerprinting service (or our own collection of screen, fonts, canvas and hardware attributes) catches more, but it is a vendor choice and a heavier privacy step; deliberately not built.
- **Privacy and consent (needs legal input before launch):** setting an identifier cookie for fraud prevention is generally treated as strictly necessary, but the privacy notice must say we do it and why, and whether a consent banner is required depends on the final site design and counsel's view. Nothing here has been reviewed by legal.
- **Shared computers will flag.** Two family members or an internet café using one browser look like the same device. The flag is a review prompt only (dismiss with a note), never a block.
- Recorded only at sign-in and registration (not on every page view), and not for staff. Sightings are never deleted automatically: a retention period is not set.
- Weak "look-alike" matching (same browser model, screen, timezone) is not done: too many false matches to be useful.
- The device sighting is not yet used by any payout rule — matches the decision that a confirmed link stays a staff judgement call, not an automatic hold.

## B11. Risk flags and profiles (6.7)

- **Which automatic detectors should raise a flag, and at what severity, is undecided.** Only strong account links raise one today (medium). Identity mismatch, country reviews and KYC state are shown as signals but don't create flags, because each already blocks payouts by its own rule. Other candidates (rapid repeat breaches, unusual sign-in geography once 6.5 exists, copy-trading once 6.8 exists) wait for those modules.
- **Whether a confirmed link should block payouts** — decided (decisions.md, 29 Sept 2026): no, stays a staff judgement call; a person must deliberately escalate a linked-account flag to high.
- **No risk score or rating.** The profile shows the highest open flag; any weighted score needs a policy decision first.
- Flags block payout **approval** only. They don't block a payout request, purchases, trading or logins, and there is no automatic account restriction.
- A resolved flag can't be reopened (raise a new one); there is no bulk review, flag types list to filter by, or dedicated risk queue page beyond Pending tasks.
- Automatic flags are raised when a link is created or gains a strong signal; flags for links that existed before this module were not back-filled (running the existing link rescan doesn't create them either).

## B12. IP-country mismatch (6.5)

- **No provider is configured** (`GEOIP_DRIVER=off` by default) — nothing is resolved or flagged until one is chosen and its API shape matches the "bare two-letter country code" contract `geoip.ts` expects (most free IP-geolocation APIs offer this as a dedicated endpoint; a JSON-only provider would need a small adapter added to `lookupCountry`).
- **The sample window (5) and minimum-match count (3) are fixed constants**, not a decided policy value or a staff-configurable setting — pick reasonable defaults, not decisions.md material on their own, but worth a look during the review.
- **Trading IPs** aren't checked (no trading platform yet, 3.3) — only login IPs.
- **No rate limiting or cost control** on the lookup itself — every login with a driver configured calls the provider; a paid provider needs a usage cap or cache added before going live.
- **This flag never blocks anything by itself** — it's medium severity like every other automatic flag (6.7); a person must escalate it to high to hold payouts.
- Doesn't distinguish a VPN/proxy from genuine travel; a geolocation provider with VPN detection would need its own field and handling, not built.

## H. Modules not started (for completeness)

6.8 Copy-trading / inverse-trading detection.
