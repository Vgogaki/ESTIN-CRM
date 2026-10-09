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
- **No CI** — deliberately left to whoever sets up hosting.
- **2FA** has no disable/recovery-code flow. **Admins have no enrolment screen at all** (admin login checks a code if one exists, but only traders can set one up), and it isn't mandatory for staff. Build before real customer data.
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
- **No referral links or click tracking.** Attribution relies on checkout sending `affiliate_code` with the order; the marketing site / checkout must implement that.
- Commission is calculated on the amount paid in the order's own currency; there is no currency conversion, and no per-challenge exclusions.
- Self-referral detection is a heuristic (own profile, same email, same card). It won't catch an affiliate buying for a friend with a different card, and it needs the affiliate to be linked to a trader profile for the profile and card checks.
- No email notification to the affiliate when a commission is approved, paid or voided — they only see the current state next time they sign in.

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
