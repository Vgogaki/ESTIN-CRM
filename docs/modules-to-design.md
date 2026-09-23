# Modules to Design

Design notes for V1 modules that were agreed but not prototyped. Each lists purpose, core behaviour, data, controls, and open points. Module numbers match `v1-build-plan.md`.

---

## 1.2 Trader authentication

**Purpose:** secure trader access to the portal.

- Registration tied to the order: a purchase creates the person record; the trader sets a password through an emailed link. Also allow direct sign-up for competitions and free products.
- Login, logout, password reset by email link, session expiry.
- **Two-factor authentication** required before requesting a payout, and optional for login.
- Email verification before first login.
- Rate limiting and lockout after repeated failed attempts.
- Record login IP and device, which feeds the risk module (6.1, 6.5).

**Open:** social login (Google/Apple), yes or no.

---

## 1.3 Admin roles & permissions

**Purpose:** control who can do what in the back office.

Suggested starting roles (configurable):

| Role | Can |
|---|---|
| Super admin | Everything, including role management |
| Operations | Trader management, pass review, notes, offers |
| Compliance / KYC | KYC review and decisions, risk flags, identity mismatch resolution |
| Finance | Payout approval, refunds, reports |
| Support | Read trader profiles, support threads, notes. No financial actions |
| Read-only | View only |

- Permissions are per module and per action (view / create / edit / approve / void).
- **Sensitive actions require specific authority:** payout approval, KYC override, rule edits, voiding, refunds, manual equity or status overrides.
- **Segregation of duties:** the same admin cannot both approve KYC and approve the payout for the same trader.
- Optional four-eyes approval for payouts above a configurable threshold.
- Admin accounts require 2FA.

---

## 1.4 Audit logging

**Purpose:** a complete, tamper-resistant record of every change.

Each entry: `id, timestamp (UTC), actor (admin, trader, system, or integration), action, entity type, entity id, before, after, reason, IP`.

- Written automatically on every state change, not by each screen remembering to call it.
- Append-only. No edit or delete, even for super admins.
- Viewable per trader (inside User 360), per entity, and as a global filterable log.
- Manual overrides require a reason, which is mandatory in the UI and rejected by the API without it.
- Retention period to be set with legal advice.

---

## 1.5 / 1.6 Challenge Builder with versioning

**Purpose:** create any challenge product as configuration.

Configurable per challenge type:

- Name, description, product type (standard / promotional / competition-linked / instant funded)
- Account size, fee, currency
- **Phases (0..n)**, each with: profit target %, daily loss %, max loss %, drawdown type (trailing / static), minimum trading days, time limit (days, optional), consistency rule (e.g. best day ≤ 50% of total profit)
- Funded stage: profit split %, payout cycle, minimum payout amount, consistency rule for payout eligibility
- Leverage cap, permitted instruments
- KYC timing (at creation / after evaluation / at first payout)
- Sellable or archived

**Versioning**
- Saving changes to a type that has live accounts creates **version N+1**. New purchases use the latest version; existing accounts stay on their version.
- Version history visible with a diff of what changed and who changed it.
- A type with no accounts can be edited in place.

**Screens:** list of types; builder with a phase editor (add, remove, reorder phases); preview showing the rules exactly as the trader will see them.

---

## 1.7 Terms acceptance records

- At purchase, store: the trader, the challenge type version, the rulebook/terms document version, timestamp, IP.
- The trader-facing rules text is generated from the challenge type version, so what they accepted matches what the engine enforces.
- Viewable in User 360 and exportable for disputes.

---

## 2.2–2.4 Payments, refunds, chargebacks

**Purpose:** record every money movement against the person.

- **Payment record:** order ref, person, account, amount, currency, provider, provider transaction id, status (pending / succeeded / failed / refunded / partially refunded / charged back), timestamps.
- Payment status driven by provider webhooks (signed, idempotent).
- **Refunds:** initiated by Finance with a reason; full or partial; the linked account is voided or kept depending on the reason.
- **Chargebacks:** webhook-driven. On chargeback, suspend the linked account, flag the person, block payouts, and notify Compliance. Record the outcome (won / lost).
- Offers and coupon codes applied at checkout are recorded against the payment.

**Open:** provider (decision 5); whether a chargeback blocks the person from future purchases.

---

## 2.5 / 2.6 KYC & verification

**Purpose:** verify identity and address before funding or payout (timing set per challenge type).

- Document collection: identity document (front/back), proof of address, optional selfie/liveness.
- Statuses: **Not started / Pending / Approved / Rejected / Further Review**. Rejection requires a reason shown to the trader.
- **Manual review screen:** documents side by side with the data the trader entered; approve / reject / request more information; notes.
- **Vendor-agnostic:** a KYC-provider interface (submit applicant, receive result webhook) so a provider can be plugged in later without changing the workflow. Manual review works without any provider.
- KYC history on the person: every submission, decision, reviewer, and reason.
- **Storage:** encrypted at rest; access restricted to the Compliance role; every view of a document is logged; defined retention period; erasure handled per GDPR.
- Periodic refresh (open decision 14): flag verified traders whose documents are expired or older than the refresh period.

---

## 3.5 Time limits & account expiry

- A scheduled job runs regularly and closes any account whose phase time limit has passed without a pass.
- Closure reason "time limit reached", recorded in the audit log and notified to the trader.
- Traders see the remaining time on their dashboard.

---

## 4.4 / 4.5 Notifications centre & email delivery

**In-app centre:** a list of messages with read/unread state, per trader.

Events that generate a notification (and, where marked, an email):

| Event | Email |
|---|---|
| Purchase confirmed / account created | ✓ |
| Phase passed / pass under review / funded | ✓ |
| Breach (with which rule, at what equity) | ✓ |
| Account expiring soon / expired | ✓ |
| KYC requested / approved / rejected | ✓ |
| Payout requested / approved / declined / paid | ✓ |
| Offer received | ✓ (marketing consent required) |
| Competition results | ✓ |
| Risk / account notice | ✓ |
| General system message | optional |

- Transactional email through a sending service, with domain authentication set up for deliverability.
- Admin-editable templates with variables (name, account, amounts).
- **Marketing messages** (offers, promotions) only to traders who consented; unsubscribe honoured. Transactional messages are always sent.

---

## 4.6 Support / messaging

- Trader opens a thread from the portal, with an optional category (account, payout, KYC, technical, other) and attachments.
- Admins reply from the back office; the trader sees replies in the portal and by email.
- Statuses: **Open / Awaiting trader / Resolved**; reopens if the trader replies.
- Assignment to an admin; internal notes not visible to the trader.
- Linked to the person's User 360 profile.

---

## 5.3–5.5 Payout rails, ledger, finance reporting

- **Ledger:** every payout with amount, method, provider reference, status, approver, and timestamps. Ties back to the account and the profit period it covers.
- Payout calculation shows its working: profit for the period, consistency rule check, split %, amount.
- Finance exports: fees received, refunds, chargebacks, payouts, by period and currency.

**Open:** payout provider (decision 6); revenue recognition (decision 10).

---

## 6.1–6.5 Risk, fraud & jurisdiction (pre-launch)

**Multiple-account detection:** link people who share a payment instrument, device, IP address or address details. Show linked people on each profile. Flag for review; do not auto-block.

**Duplicate / suspicious identity:** email/name mismatch (prototyped); same name and date of birth across different emails; KYC document reused across people.

**Restricted countries**
- Admin-configurable list, per country: *allowed / review / blocked*, applied separately to registration, purchase, trading, and payout.
- Checked against KYC country, billing country, and IP geolocation.
- "Review" routes the case to the Pending tasks queue rather than blocking.
- **The list content is a business and legal decision (open decision 11), not a development one.** Do not ship a default list copied from elsewhere.

**KYC country vs. IP / trading location mismatch:** flag when login or trading IPs consistently differ from the KYC country.

**Risk flags on the person:** each flag has a type, source, severity, status (open / reviewed / dismissed), reviewer and reason. Open high-severity flags block payouts.

---

## 7.3 User 360 profile

One page per person bringing together:

- Personal details and contact information
- KYC status and history (documents restricted by role)
- Accounts: active, passed, failed, funded, voided, each with phase and rule progress
- Payments, refunds and chargebacks
- Payouts
- Competition participation
- Offers received and redeemed
- Risk flags and linked people
- Support threads
- Internal notes
- Audit trail for this person

Build it last among these, as an aggregation of the modules above.

---

## 7.5 Training / educational content

- Content library: articles, guides, videos, grouped into sections (platform how-to, challenge rules, risk management, trading education).
- Admin-managed content; publish / unpublish.
- The rules explanations should be generated from challenge type configuration where possible, so they never contradict the actual rules.
- Keep educational content clear of anything that reads as personal investment advice.

---

## 7.4 Affiliates (if in V1: open decision 7)

- Affiliate accounts with unique codes and links; commission model (percentage of fee, per sale, tiered).
- Attribution on `POST /orders` via `affiliate_code`.
- Commission ledger, clawback on refund or chargeback, affiliate payouts, affiliate dashboard.
- Watch for self-referral and affiliates buying challenges for referred traders.
