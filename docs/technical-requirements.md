# ESTIN CRM: Technical and System Requirements

**Status snapshot:** 13 October 2026. Describes what exists in the repository today, not the original plan.
**Audience:** the co-founder, the technical contractor, and anyone assessing, hosting or extending the system.
**Companion documents:** `v1-build-plan.md` (module status), `crm-specification.md` (how it should work), `decisions.md` (decided and open), `deferred-items.md` (what is not built and why), `deployment.md` and `hosting-review.md` (hosting).

---

## 1. What the system is

A back office, a trader portal, an affiliate portal and a public REST API for a Cyprus-based proprietary trading **evaluation** firm. A customer buys a simulated trading account with defined rules. If they reach the profit target without breaching the loss limits they progress to a funded (still simulated) account and receive a share of simulated profit as real payouts.

There is no live market execution and no customer capital at risk. The system does not match orders. It receives an equity figure, evaluates the account against its rules, and runs the commercial and operational processes around that.

### Current state at a glance

| | |
|---|---|
| Modules in the build plan | 48 |
| Built and verified (🟢) | 23 |
| Built, with known gaps or a pending vendor/decision (🟡) | 19 |
| Not built (🔴) | 6 (payment provider, refunds/chargebacks, trading-platform selection, instrument restrictions, payout rails, copy-trading detection) |
| Data model | 37 tables, 35 enumerations, 24 database migrations |
| Interfaces | 76 API endpoints, 44 screens |
| Code | about 18,000 lines of TypeScript, 61 server modules |
| Automated tests | 198 unit tests across 25 files, all passing |
| Environments | Local (development) and a hosted staging copy in the EU. **No production environment yet.** |

---

## 2. Architecture

One deployable application, one database.

```
Browsers ──HTTPS──▶ [ Password gate (staging only) ]
                            │
                ┌───────────▼────────────────────────────────────┐
                │  Next.js application (single container)        │
                │   /admin      back office (staff)               │
                │   /portal     trader portal                     │
                │   /affiliate  affiliate portal                  │
                │   /api/v1     integration API (checkout)        │
                │   /api/...    internal APIs used by the screens │
                │   Background jobs (pg-boss): expiry sweep,      │
                │   email retry                                   │
                └───────┬─────────────────────────┬──────────────┘
                        │                         │
                 PostgreSQL 16            Encrypted file storage
              (data, audit log, jobs)     (KYC documents, attachments)

 Outbound, optional: SMTP relay (email), IP-geolocation API
 Inbound:  checkout / payment system calls /api/v1/orders
```

Design choices that matter:
- **Three separate login systems** (staff, traders, affiliates) with separate sessions, because an affiliate need not be a trader and staff must never share a session store with customers.
- **Rules are data, not code.** Challenge phases, limits and payout terms are configuration on versioned challenge types; the engine evaluates "phase N of M against these parameters".
- **Every state change is audited** to an append-only log enforced by a database trigger.
- **Vendor-dependent pieces are pluggable by configuration** (email, IP geolocation), so choosing a provider later is a settings change, not a rebuild.

---

## 3. Technology stack

All versions are pinned exactly (no ranges) and the lockfile is committed. Updates are deliberate (see `dependencies.md`).

| Layer | Technology | Version |
|---|---|---|
| Application framework | Next.js (App Router) with React | 16.3.6 / 19.2.8 |
| Language | TypeScript (strict) | 5.9.3 |
| Database | PostgreSQL | 16 |
| ORM and migrations | Prisma, with the PostgreSQL driver adapter | 7.10.0 |
| Validation | Zod | 4.6.5 |
| Scheduled jobs | pg-boss (runs inside the same Postgres) | 12.34.0 |
| Passwords | bcryptjs | 3.0.3 |
| Two-factor codes | otplib (TOTP) | 13.5.0 |
| Email | nodemailer (SMTP) | 10.0.10 |
| Styling | Tailwind CSS | 4.3.3 |
| Unit tests | Vitest | 4.1.11 |
| Runtime | Node.js | 22 (container image); also run on 24 in development |
| Packaging | Docker, multi-stage, standalone Next.js output | node:22-bookworm-slim |

**Runtime dependencies: 13 packages. Development-only: 14 packages.** No content-management system or plug-in framework is used.

---

## 4. Functional scope (what is built)

Legend: 🟢 built and verified; 🟡 built, with a known gap, a pending vendor or a pending decision; 🔴 not built.

### Foundation
| Module | Status | Notes |
|---|---|---|
| Data model; terms acceptance records | 🟢 | One person, many accounts; KYC belongs to the person |
| Trader authentication | 🟢 | Registration, email verification, login, password reset, lockout, optional TOTP 2FA |
| Staff roles and permissions | 🟢 | 24 permissions, 6 default roles, enforced server-side |
| Audit logging | 🟢 | Append-only; actor, action, entity, before, after, time, reason |
| Challenge Builder and versioning | 🟢 | Phases as data; editing a live type creates a new version |
| Environments and deployment | 🟡 | Container image, migrations on start, staging host; production not provisioned |

### Orders, KYC, accounts
| Module | Status | Notes |
|---|---|---|
| Order intake API | 🟢 | Idempotent on `order_ref`; replayed orders never duplicate |
| Payment provider; refunds and chargebacks | 🔴 | Waiting on provider choice |
| Purchase and payment history | 🟢 | |
| KYC collection, review, decision | 🟢 | Encrypted at rest; reviewer cannot approve the same trader's payout |
| KYC document storage backend | 🟡 | Encrypted files on local disk; needs object storage for production |
| Back-office trader management; firm statistics | 🟢 | |

### Rules and evaluation
| Module | Status | Notes |
|---|---|---|
| Rules engine | 🟡 | Daily and total loss (trailing or static), profit target, minimum trading days; consistency rule not enforced |
| Breach and pass automation; time limits and expiry | 🟢 | Auto-close on breach; pass routed to manual review; scheduled expiry sweep |
| Account phase advancement | 🟢 | Pass review → next phase or funded, with audited equity-reset choice |
| Equity feed integration | 🟡 | Equity is typed in by staff; stands in for the trading platform |
| Trading platform selection; instrument restrictions | 🔴 | Open vendor decision |
| Pending-tasks queue | 🟡 | Derived automatically from account, KYC, risk and support state |

### Trader portal
| Module | Status | Notes |
|---|---|---|
| Dashboard, plans, rule meters, KYC upload | 🟢 | |
| Notifications centre | 🟡 | In-app, plus email copy |
| Transactional email | 🟡 | Built and tested; no provider connected (nothing delivered) |
| Support and messaging | 🟡 | Threads, statuses, encrypted attachments, in-app and email replies |

### Payouts and finance
| Module | Status | Notes |
|---|---|---|
| Payout request, approval, ledger | 🟢 | Gated on funded phase, verified KYC, no identity mismatch, no open high risk flag, no open country review, segregation of duties |
| Payout rails | 🔴 | A payout can be approved but never marked paid |
| Finance reporting and CSV export | 🟡 | Per-currency; refunds and chargebacks not tracked |

### Risk and compliance
| Module | Status | Notes |
|---|---|---|
| Duplicate / suspicious identity | 🟢 | Email/name mismatch flagged, blocks payout until reviewed |
| Multiple-account detection | 🟡 | Links people by shared KYC document, payment card, device or IP; flags, never auto-blocks |
| Restricted-country controls | 🟡 | Allowed / review / blocked per country per stage; list ships empty; CSV bulk upload |
| Jurisdiction matrix tracker | 🟡 | Tracks the four outside inputs; the list itself is a business task |
| IP-country mismatch | 🟡 | Pluggable geolocation driver; inert until a provider is configured |
| Device recognition | 🟡 | Cookie-based device id, not true fingerprinting |
| Risk flags and profiles | 🟡 | Typed flags; open high-severity flag blocks payout approval |
| Copy-trading detection | 🔴 | Needs trade-level data from a trading platform |

### Growth and operations
| Module | Status | Notes |
|---|---|---|
| Offers and discount campaigns | 🟢 | Cap enforced at issue time; breached-trader send delay |
| Competitions | 🟡 | Qualification, ranking, prize ladder; entry data simulated |
| User 360 profile | 🟡 | One page per person combining all modules |
| Affiliates and affiliate portal | 🟡 | Own login, generated (never typed) referral codes with a back-office register, introduced-trader dashboard, commission ledger, self-referral flagging; payouts manual |
| Training content | 🟡 | Staff-written articles plus rules generated from live challenge settings |
| Team presence; admin two-factor | 🟢 | Added 9–10 October 2026 |

---

## 5. Data model

37 tables, grouped by purpose.

| Area | Tables |
|---|---|
| People and accounts | Person, Account, EquityTick, Note, TermsAcceptance |
| Products | ChallengeType, ChallengePhase |
| Money | Payment, Withdrawal, AffiliateCommission |
| Identity and KYC | KycDocument, AccountLink, DeviceSighting, RiskFlag |
| Access and security | AdminUser, AdminRole, AdminSession, AdminRecoveryCode, TraderSession, AffiliateSession, AuthToken |
| Audit | AuditLog (append-only) |
| Operations | StaffTask (work waiting on staff, with status: pending, in review, completed) |
| Purchasing | CheckoutSession (a trader's pending portal purchase: server-set price, pinned challenge version, terms, payment result) |
| Compliance | CountryRule, CountryReview, JurisdictionInput |
| Engagement | Notification, SupportThread, SupportMessage, SupportAttachment, TrainingArticle |
| Email | EmailTemplate, EmailOutbox |
| Growth | OfferCampaign, IssuedOffer, Competition, CompetitionEntry, Affiliate, AffiliateCode, AffiliateReferral |

Principles applied throughout:
- **Money is stored as decimal**, never floating point; **all timestamps are UTC**.
- **Records are never hard-deleted**: they are voided with actor, time and reason. GDPR erasure is by anonymisation.
- **Existing accounts stay pinned** to the challenge-type version they bought.
- Identifiers are non-sequential (cuid), so they can't be enumerated.

---

## 6. Business rules enforced by the system

Enforced **on the server**; screens only mirror them.

- Payout approval is blocked unless KYC is verified, there is no unresolved identity mismatch, there is no open payout-stage country review, and there is no open high-severity risk flag.
- The staff member who last reviewed a trader's KYC cannot approve that trader's payout.
- A blocked country is refused at registration, purchase and payout request; "review" lets it through and opens a review task.
- Breach evaluation uses **equity**, not balance. Trailing drawdown references the end-of-day high-water mark. Minimum trading days default to 3 (configurable per challenge type). Rollover is midnight UTC. A trading day is any closed trade.
- A replayed order never creates a second account or payment (idempotent on `order_ref`).
- A challenge bought in the portal is priced on the server, uses the same order path as the website, and can't be bought twice by a double click. Purchases are off unless a payment driver is configured (PAYMENT_DRIVER); the only driver today is a labelled simulation.
- Referral codes are system-generated and recorded; a code not in the register earns nothing. A trader has one introducer (the first), and commission is paid only on orders carrying the introducing affiliate's own code.
- An offer's usage cap is enforced when issued, not only when redeemed.
- Funded accounts can only be reached through pass review and an explicit, audited advance.
- **Competing actions are serialised (13 Oct 2026).** Requesting a payout, deciding a payout, advancing an account, manually overriding an account, voiding an account and the time-limit sweep each run in a database transaction that first locks the account (and, where KYC matters, the trader), then re-reads and re-checks before writing. Two actions arriving at the same moment are handled one after the other: exactly one takes effect, the other is refused with a clear message (HTTP 409) or skipped, and there is one audit entry and one notification. The change and its audit entry commit together. The database also refuses a second pending payout for the same account outright (partial unique index). Proven by `npm run test:db` (`src/server/concurrency.db.test.ts`).

---

## 7. Security

### Implemented
| Control | Detail |
|---|---|
| Authentication | Separate staff, trader and affiliate logins; bcrypt password hashing; minimum 10 characters |
| Lockout | 5 wrong passwords **or wrong codes** locks an account for 15 minutes |
| Two-factor | TOTP for staff and traders; staff get 10 one-time recovery codes; turning it off needs password and code |
| Sessions | Opaque random tokens stored hashed; HttpOnly, SameSite, Secure cookies; staff 12 h, traders and affiliates 7 days |
| Authorisation | Permission checks on every staff API and page, server-side |
| Audit | Append-only log, enforced by a database trigger; includes failed logins and 2FA events |
| Encryption at rest | KYC documents and support attachments encrypted with AES-256-GCM |
| Input validation | Zod schemas on every API; file type and size limits on uploads |
| CSV safety | Export defends against spreadsheet formula injection |
| Browser hardening | HSTS, no-framing, no-sniff, referrer and permissions policies, no search indexing |
| Staging gate | Optional site-wide username/password in front of everything; fails closed |
| Secrets | Environment variables only; `.env` excluded from source control and from the image |
| Fraud signals | Multiple-account links, device and IP signals, identity mismatch, country review, risk flags |

### Known gaps (to close before real customer data)
1. **No independent security review has been done.**
2. Two-factor is **not mandatory** for staff, and the authenticator secret is stored **unencrypted**.
3. No Content-Security-Policy.
4. The client IP is read from the first `X-Forwarded-For` value, which a visitor can influence behind a proxy.
5. No rate limiting beyond the per-account lockout.
6. Webhooks are not signed (none exist yet); the order API uses a single shared key rather than per-integration keys.
7. KYC documents are on local disk, not managed object storage; no malware scanning on uploads.
8. No user-facing audit-log viewer (the log is recorded and queryable only through the database).
9. GDPR erasure of a whole person is not built (individual documents can be erased).

---

## 8. Integrations and interfaces

### Provided
| Interface | Purpose | Protection |
|---|---|---|
| `POST /api/v1/orders` | Checkout creates a trader and account after payment | Bearer API key; idempotent on `order_ref` |
| `GET /api/v1/country-check` | Checkout asks whether a country is allowed before taking payment | API key |
| `GET /api/health` | Liveness check for the host | Open, returns nothing sensitive |
| `GET /api/unsubscribe` | One-click marketing opt-out | Signed link |
| Internal APIs (about 70) | Used by the back office, portals | Session plus permission |

### Consumed (all optional, configuration only)
| Service | How it connects |
|---|---|
| Email provider | Any SMTP relay (`EMAIL_DRIVER=smtp`, `SMTP_URL`, `EMAIL_FROM`) |
| IP geolocation | Any HTTP endpoint returning a bare country code (`GEOIP_DRIVER=http`, `GEOIP_API_URL`) |

### Not integrated yet (vendor decisions open)
Trading platform / equity feed, payment provider, payout rails, KYC identity-verification provider, object storage for documents.

---

## 9. Non-functional requirements

| Area | Current position |
|---|---|
| Performance | **Not load-tested.** Designed for a small operation (hundreds to low thousands of accounts). Account evaluation is per-event, not a full-table scan |
| Availability | Single instance. A container restart is a few seconds; scheduled jobs resume and are safe to run on several instances |
| Data integrity | Migrations run automatically on start under a database lock; audit log cannot be altered |
| Backups | **Not configured.** Must be managed by the host, with a tested restore |
| Monitoring | Health endpoint only. No alerting configured |
| Data residency | **EU only** (GDPR). Staging runs in Frankfurt |
| Browsers | Current evergreen browsers (Chrome, Edge, Firefox, Safari) |
| Language and currency | English; euros only (decided) |
| Accessibility | Semantic HTML and labelled controls; no formal accessibility audit |
| Retention | KYC re-verification has no fixed schedule (decided); sighting and audit retention periods are not set |

---

## 10. Infrastructure and environment requirements

### To run the application
| Requirement | Specification |
|---|---|
| Runtime | Node.js 22 (the supplied container image) |
| Database | PostgreSQL 16, **EU region**, managed with backups. The application's database user needs `CREATE` on the database (pg-boss creates its own schema) |
| Container | One instance minimum. Image is about 1.7 GB |
| Memory / CPU | A small instance has been sufficient for staging with demo data. Production sizing needs a load test |
| Network | HTTPS only, with a valid certificate and domain; the database reachable only from the application |
| Storage | Persistent, encrypted storage for uploaded documents (currently local disk) |
| Outbound | SMTP to the chosen email provider; optional HTTPS to a geolocation provider |

### Configuration (environment variables)
| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection |
| `AUTH_SECRET` | Yes | Signs unsubscribe links |
| `ORDERS_API_KEY` | For checkout | Protects the order and country-check APIs |
| `KYC_ENCRYPTION_KEY` | For file storage | 32 bytes, base64. **Losing it makes every stored document unreadable; back it up separately** |
| `KYC_STORAGE_DIR` | Optional | Where encrypted files are written |
| `EMAIL_DRIVER`, `SMTP_URL`, `EMAIL_FROM` | Optional | Email delivery (default: record only) |
| `APP_BASE_URL` | Optional | Address used in email links |
| `PAYMENT_DRIVER` | Optional | Unset = portal purchases off (the live default). `demo` = labelled simulated payment, local and review copies only |
| `MAX_ACTIVE_ACCOUNTS` | Optional | Most challenge accounts one trader may hold at once. Unset/0 = no limit |
| `GEOIP_DRIVER`, `GEOIP_API_URL` | Optional | IP geolocation (default: off) |
| `REVIEW_GATE`, `REVIEW_GATE_USER`, `REVIEW_GATE_PASSWORD` | Staging only | Site-wide password gate |
| `RUN_SEED`, `ALLOW_DEMO_SEED`, `SEED_FOUNDER_PASSWORD`, `SEED_COFOUNDER_EMAIL`, `SEED_COFOUNDER_PASSWORD` | Staging only | Create admin accounts and demo data |

### Scheduled jobs
| Job | Frequency | Purpose |
|---|---|---|
| Account expiry sweep | Every 15 minutes | Closes accounts past their phase time limit |
| Email outbox retry | Every minute | Resends failed emails, up to 5 attempts |

### To develop locally
Node.js 22 or newer, Docker Desktop (for the PostgreSQL container), npm. On Windows on ARM, Prisma's migration engine is blocked by the operating system, so migrations run through a Docker container (documented in `dev-environment-notes.md`).

---

## 11. Environments

| Environment | State | Data | Notes |
|---|---|---|---|
| Local | Working | Real founder record plus test data | Developer machine only |
| Staging | Live (Render, Frankfurt) | **Fake demo data only** | Password-gated; deploys automatically from the `main` branch |
| Production | **Not provisioned** | | Needs the contractor's foundation setup (below) |

Delivery path: change → commit → push to GitHub → pull request → merge to `main` → automatic rebuild and deploy. There is no continuous-integration pipeline yet.

---

## 12. Quality and verification

| Area | Position |
|---|---|
| Unit tests | 198, covering the rules engine, payouts, expiry, offers, competitions, country rules, link detection, authentication helpers, CSV import, and more (`npm test`, no database needed) |
| Database tests | 11, run against a real throwaway Postgres built from the migration files (`npm run test:db`): competing payout requests, competing approve/decline, duplicate advance, duplicate sweep, sweep versus breach, overlapping overrides and voids, the one-pending-payout database rule. Each was confirmed to fail on the code as it was before the fix |
| Static checks | TypeScript strict and ESLint, clean |
| Live verification | Each module was exercised end to end against a running instance with real requests |
| Not present | Browser-automation (end-to-end) suite, load tests, penetration test, accessibility audit, coverage report |

---

## 13. What remains before a real launch

1. **Vendor decisions:** trading platform, payment provider, payout rails, email provider, KYC storage, IP geolocation provider.
2. **Legal inputs:** legal entity and permission, brand and trademark clearance, the restricted-country list, final terms and rulebook, privacy notice and consent wording.
3. **Production foundation (contractor):** production and staging environments, managed PostgreSQL with a tested restore, secrets management, domain and TLS, monitoring and alerting, deployment pipeline.
4. **Security:** independent security review; mandatory staff two-factor; the gaps listed in section 7.
5. **Remove demo-only items:** the admin "Test tools" page, demo seed, and the staging gate.
6. **Remaining build:** equity feed from the chosen platform, payment and refund handling, payout rails, copy-trading detection, consistency-rule enforcement, instrument restrictions.

Full item-by-item detail, with what blocks each, is in `deferred-items.md`; decisions already taken are in `decisions.md`.
