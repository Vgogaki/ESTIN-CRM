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

- **IP geolocation** — no geolocation provider, so IP isn't checked. *Vendor.*
- **KYC-document country** — KYC stores documents but no separate structured country field. *Build.*
- **What is checked today** — only the country given at registration or on the order, which also serves as the billing country.
- **Trading-stage rules** — can be saved, but can't be enforced until there's a trading platform. *Platform.*
- **The list is empty** — which countries belong on it is a legal/business call (decision #11). *Decision.*
- **Blocked purchases can arrive after payment** — checkout must call `GET /api/v1/country-check` first; until there's a refund flow (2.3) a blocked order that was already paid has no automated remedy. *Vendor.*

## B2. Multiple-account detection (6.1)

- **Device linking** — needs device fingerprinting (6.6, after launch). *Build.*
- **Address linking** — no address is collected anywhere; needs a field on the person or on KYC. *Decision + Build.*
- **Payment-instrument linking** works but stays empty until a payment provider supplies a fingerprint token. *Vendor.*
- **Whether a confirmed link should affect payouts** — spec 6.1 says flag for review, do not auto-block; the later "open high-severity risk flags block payouts" rule (6.7) isn't built. *Decision.*
- IP linking is deliberately weak and never queued on its own; any threshold for "many people on one IP" is undecided.

## B3. Finance (5.5)

- **Refunds and chargebacks** — reported as "not tracked"; needs module 2.3 and a stored refund amount. *Vendor (payment provider).*
- **Revenue recognition** — figures are cash received at purchase, no deferral (decision #10). *Decision (accountant).*
- **Paid vs approved payouts** — needs a payout provider. *Vendor.*
- Single-currency firm statistics on the dashboard vs. per-currency here — the dashboard still sums one currency.
- No scheduled/emailed reports, no accounting-package format (only generic CSV).

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
- **Choosing the email provider (4.5)** — the email system is built and verified against a test SMTP server, but until a provider is chosen and its `EMAIL_DRIVER=smtp`, `SMTP_URL`, `EMAIL_FROM` settings are filled in, nothing is delivered (messages are recorded and printed to the server log). Also needs the sending domain's SPF/DKIM/DMARC set up for deliverability, which only the domain owner / contractor can do.
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
- **Risk flags** as a typed list (type, severity, reviewer; "open high-severity flags block payouts") don't exist; the profile shows what does (linked accounts, identity mismatch, country reviews). Build with 6.6-6.8 if wanted.
- The profile is one long page, not tabs; the audit trail is capped at the latest 100 entries with no filtering or export.
- KYC documents are shown as before (view restricted by `kyc.view`); no separate KYC history timeline beyond the audit trail.

## B8. Training content (7.5)

- **No launch content is written.** The library starts empty; the articles (platform guides, risk management, education) need to be written, and reviewed so nothing reads as personal investment advice. The disclaimer wording is a draft for legal review.
- Article text is plain text (paragraphs and links); no images, headings, embedded video or rich formatting. Video is a link that opens in a new tab.
- The generated rules explanation doesn't describe the consistency rule (the engine doesn't enforce one yet); it only notes that one applies. It shows only live (on-sale) challenges, not the version an existing trader bought, and English only.
- No read tracking, search, categories beyond the four sections, or "required reading" gating.
- Articles have no version history beyond the audit log's before/after.

## B9. Affiliates (7.4)

- **Decision #7 is still open**: whether affiliates ship in V1, and the commission model. Built with a flat percentage per affiliate (no default); tiered or per-sale-fixed models, and a holding period before commission can be approved, aren't built.
- **Automatic clawback on refund or chargeback** waits for 2.3 (payment provider). Until then staff void a commission by hand, and **a commission already paid can't be reversed in the system** (money owed back would need to be tracked outside it, or netted against the next commission).
- **No affiliate dashboard or login.** Affiliates can't see their own sales or earnings; staff see them. Building it needs a separate affiliate login (a new user type).
- **No payout to affiliates**: rails aren't chosen (decision #6), so "paid" is a manual record with a reference, not a transfer. There is no batching, statement, tax or invoice handling.
- **No referral links or click tracking.** Attribution relies on checkout sending `affiliate_code` with the order; the marketing site / checkout must implement that.
- Commission is calculated on the amount paid in the order's own currency; there is no currency conversion, and no per-challenge exclusions.
- Self-referral detection is a heuristic (own profile, same email, same card). It won't catch an affiliate buying for a friend with a different card, and it needs the affiliate to be linked to a trader profile for the profile and card checks.

## H. Modules not started (for completeness)

6.5 KYC-country vs IP mismatch · 6.6–6.8 Device fingerprinting / risk profiles / copy-trading detection.
