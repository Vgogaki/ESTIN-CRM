import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/test/test-database";

/**
 * Buying a challenge in the portal, against a real database: the server sets the
 * price, offers apply and are used up once, a double click can't buy twice, and a
 * website buyer is invited to set a password. Run with `npm run test:db`.
 */

let testDb: TestDatabase;
let db: typeof import("@/server/db").db;
let checkout: typeof import("@/server/checkout");
let affiliates: typeof import("@/server/affiliates");
let referrals: typeof import("@/server/affiliate-referrals");
let orders: typeof import("@/server/orders");
let auth: typeof import("@/server/auth/trader");

const IP = "203.0.113.9";
let n = 0;
const next = () => ++n;

beforeAll(async () => {
  testDb = await createTestDatabase();
  process.env.DATABASE_URL = testDb.url;
  process.env.PAYMENT_DRIVER = "demo";
  ({ db } = await import("@/server/db"));
  checkout = await import("@/server/checkout");
  affiliates = await import("@/server/affiliates");
  referrals = await import("@/server/affiliate-referrals");
  orders = await import("@/server/orders");
  auth = await import("@/server/auth/trader");
});

afterAll(async () => {
  await db?.$disconnect();
  await testDb?.drop();
});

async function makeChallenge(fee = 200) {
  const k = next();
  return db.challengeType.create({
    data: {
      familyId: `fam-${k}`,
      version: 1,
      name: `Challenge ${k}`,
      accountSize: 10000,
      fee,
      leverageCap: 30,
      permittedInstruments: [],
      active: true,
      phases: { create: [{ order: 1, label: "Evaluation", isFunded: false, profitTargetPct: 8, dailyLossPct: 5, maxLossPct: 10 }] },
    },
  });
}

async function makePerson(country = "CY") {
  const k = next();
  return db.person.create({ data: { fullName: `Trader ${k}`, email: `trader${k}@buy.test`, country, passwordHash: "x", emailVerifiedAt: new Date() } });
}

async function makeOffer(personId: string, challenge: { id: string; fee: unknown }, offerFee: number, opts: { expired?: boolean } = {}) {
  const k = next();
  const admin = await db.adminUser.create({
    data: {
      email: `a${k}@buy.test`,
      name: "Admin",
      passwordHash: "x",
      role: { connectOrCreate: { where: { name: "r" }, create: { name: "r", permissions: [] } } },
    },
  });
  const campaign = await db.offerCampaign.create({
    data: {
      name: `Comeback ${k}`,
      code: `COMEBACK${k}`,
      discountType: "percent",
      discountValue: 25,
      audience: "specific_trader",
      validFrom: new Date(Date.now() - 86_400_000),
      validTo: new Date(Date.now() + 30 * 86_400_000),
    },
  });
  const offer = await db.issuedOffer.create({
    data: {
      campaignId: campaign.id,
      personId,
      challengeTypeId: challenge.id,
      normalFee: String(challenge.fee),
      offerFee,
      issuedById: admin.id,
      expiresAt: new Date(Date.now() + (opts.expired ? -1000 : 7 * 86_400_000)),
    },
  });
  return { campaign, offer };
}

const start = (personId: string, challengeTypeId: string, extra: { acceptTerms?: boolean; referralCode?: string | null } = {}) =>
  checkout.startCheckout({ personId, challengeTypeId, acceptTerms: extra.acceptTerms ?? true, referralCode: extra.referralCode ?? null, ipAddress: IP });
const pay = (sessionId: string, personId: string) => checkout.completeCheckout({ sessionId, personId, ipAddress: IP });

describe("starting a checkout", () => {
  it("the server sets the price, pins the challenge, and records the terms", async () => {
    const ch = await makeChallenge(300);
    const p = await makePerson();
    const s = await start(p.id, ch.id);

    expect(s.amountDue.toString()).toBe("300");
    expect(s).toMatchObject({ challengeTypeId: ch.id, status: "pending", currency: "EUR", offerCode: null });
    expect(s.orderRef).toMatch(/^PORTAL-/);
    expect(s.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(await db.auditLog.count({ where: { action: "checkout.started", entityId: s.id } })).toBe(1);
  });

  it("requires the terms to be accepted", async () => {
    const ch = await makeChallenge();
    const p = await makePerson();
    await expect(start(p.id, ch.id, { acceptTerms: false })).rejects.toThrow(/accept the terms/);
    expect(await db.checkoutSession.count({ where: { personId: p.id } })).toBe(0);
  });

  it("refuses a challenge that isn't on sale", async () => {
    const ch = await makeChallenge();
    await db.challengeType.update({ where: { id: ch.id }, data: { active: false } });
    await expect(start((await makePerson()).id, ch.id)).rejects.toMatchObject({ status: 422 });
  });

  it("refuses a blocked country before any payment", async () => {
    const ch = await makeChallenge();
    await db.countryRule.create({ data: { countryCode: "ZZ", purchase: "blocked" } });
    const p = await makePerson("ZZ");
    await expect(start(p.id, ch.id)).rejects.toMatchObject({ status: 403 });
    expect(await db.checkoutSession.count({ where: { personId: p.id } })).toBe(0);
  });

  it("clicking Continue twice reuses the same open checkout", async () => {
    const ch = await makeChallenge();
    const p = await makePerson();
    const a = await start(p.id, ch.id);
    const b = await start(p.id, ch.id);
    expect(b.id).toBe(a.id);
    expect(await db.checkoutSession.count({ where: { personId: p.id } })).toBe(1);
  });

  it("an unknown referral code is refused, a real one is kept", async () => {
    const ch = await makeChallenge();
    const p = await makePerson();
    await expect(start(p.id, ch.id, { referralCode: "EST-NOTREAL1" })).rejects.toThrow(/referral code/);

    const k = next();
    const aff = await affiliates.createAffiliate({ name: "Partner", email: `p${k}@aff.test`, commissionPct: "10", adminId: "x", ipAddress: IP });
    const code = (await referrals.generateAffiliateCode({ affiliateId: aff.id, ipAddress: IP })).code;
    const s = await start(p.id, ch.id, { referralCode: code.toLowerCase() });
    expect(s.affiliateCode).toBe(code);
  });
});

describe("offers", () => {
  it("the trader's own offer sets the price, and nobody else's offer applies", async () => {
    const ch = await makeChallenge(400);
    const owner = await makePerson();
    const other = await makePerson();
    await makeOffer(owner.id, ch, 300);

    const mine = await start(owner.id, ch.id);
    expect(mine.amountDue.toString()).toBe("300");
    expect(mine.offerCode).toMatch(/^COMEBACK/);

    const theirs = await start(other.id, ch.id);
    expect(theirs.amountDue.toString()).toBe("400");
    expect(theirs.offerCode).toBeNull();
  });

  it("an expired offer doesn't apply", async () => {
    const ch = await makeChallenge(400);
    const p = await makePerson();
    await makeOffer(p.id, ch, 300, { expired: true });
    expect((await start(p.id, ch.id)).amountDue.toString()).toBe("400");
  });

  it("paying with an offer charges the offer price and uses the offer up", async () => {
    const ch = await makeChallenge(400);
    const p = await makePerson();
    const { offer } = await makeOffer(p.id, ch, 300);
    const s = await start(p.id, ch.id);
    const { account } = await pay(s.id, p.id);

    const payment = await db.payment.findFirstOrThrow({ where: { accountId: account.id } });
    expect(payment.amountPaid.toString()).toBe("300");
    expect(await db.issuedOffer.findUniqueOrThrow({ where: { id: offer.id } })).toMatchObject({ status: "redeemed", redeemedOrderRef: s.orderRef });
    // The same offer can't discount a second purchase.
    expect((await start(p.id, ch.id)).amountDue.toString()).toBe("400");
  });

  it("an offer that is withdrawn while the trader is on the payment page stops the purchase", async () => {
    const ch = await makeChallenge(400);
    const p = await makePerson();
    const { offer } = await makeOffer(p.id, ch, 300);
    const s = await start(p.id, ch.id);
    await db.issuedOffer.update({ where: { id: offer.id }, data: { status: "withdrawn" } });

    await expect(pay(s.id, p.id)).rejects.toMatchObject({ status: 409 });
    expect(await db.account.count({ where: { personId: p.id } })).toBe(0);
    expect((await db.checkoutSession.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("expired");
  });
});

describe("paying", () => {
  it("creates the account through the order path, with the payment, terms and a confirmation", async () => {
    const ch = await makeChallenge(250);
    const p = await makePerson();
    const s = await start(p.id, ch.id);
    const { account, alreadyDone } = await pay(s.id, p.id);

    expect(alreadyDone).toBe(false);
    expect(account).toMatchObject({ personId: p.id, challengeTypeId: ch.id, orderRef: s.orderRef, phase: "evaluation", status: "active" });
    const payment = await db.payment.findFirstOrThrow({ where: { accountId: account.id } });
    expect(payment).toMatchObject({ paymentProvider: "demo-checkout", currency: "EUR" });
    expect(payment.amountPaid.toString()).toBe("250");
    expect(await db.termsAcceptance.count({ where: { accountId: account.id } })).toBe(1);
    expect(await db.notification.count({ where: { personId: p.id, type: "account_created" } })).toBe(1);

    const done = await db.checkoutSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(done).toMatchObject({ status: "paid", accountId: account.id, paymentProvider: "demo-checkout" });
    expect(await db.auditLog.count({ where: { action: "checkout.completed", entityId: s.id } })).toBe(1);
  });

  it("clicking Pay several times at the same moment creates exactly one account and one payment", async () => {
    const ch = await makeChallenge();
    const p = await makePerson();
    const s = await start(p.id, ch.id);

    const results = await Promise.allSettled([pay(s.id, p.id), pay(s.id, p.id), pay(s.id, p.id)]);

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const ids = new Set(results.map((r) => (r as PromiseFulfilledResult<{ account: { id: string } }>).value.account.id));
    expect(ids.size).toBe(1);
    expect(await db.account.count({ where: { personId: p.id } })).toBe(1);
    expect(await db.payment.count({ where: { orderRef: s.orderRef } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "checkout.completed", entityId: s.id } })).toBe(1);
  });

  it("paying again later returns the same account", async () => {
    const ch = await makeChallenge();
    const p = await makePerson();
    const s = await start(p.id, ch.id);
    const first = await pay(s.id, p.id);
    const again = await pay(s.id, p.id);
    expect(again.alreadyDone).toBe(true);
    expect(again.account.id).toBe(first.account.id);
  });

  it("a trader can only pay their own checkout", async () => {
    const ch = await makeChallenge();
    const owner = await makePerson();
    const stranger = await makePerson();
    const s = await start(owner.id, ch.id);

    await expect(pay(s.id, stranger.id)).rejects.toMatchObject({ status: 404 });
    expect(await checkout.getCheckout(s.id, stranger.id)).toBeNull();
    expect(await db.account.count({ where: { personId: owner.id } })).toBe(0);
  });

  it("an expired checkout can't be paid", async () => {
    const ch = await makeChallenge();
    const p = await makePerson();
    const s = await start(p.id, ch.id);
    await db.checkoutSession.update({ where: { id: s.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    await expect(pay(s.id, p.id)).rejects.toMatchObject({ status: 409 });
    expect(await db.account.count({ where: { personId: p.id } })).toBe(0);
  });

  it("a referral code on the checkout introduces the trader and earns the commission", async () => {
    const ch = await makeChallenge(200);
    const k = next();
    const aff = await affiliates.createAffiliate({ name: "Partner", email: `p${k}@aff.test`, commissionPct: "10", adminId: "x", ipAddress: IP });
    const code = (await referrals.generateAffiliateCode({ affiliateId: aff.id, ipAddress: IP })).code;
    const p = await makePerson();
    const s = await start(p.id, ch.id, { referralCode: code });
    await pay(s.id, p.id);

    expect(await db.affiliateReferral.findUnique({ where: { personId: p.id } })).toMatchObject({ affiliateId: aff.id });
    const c = await db.affiliateCommission.findMany({ where: { affiliateId: aff.id } });
    expect(c).toHaveLength(1);
    expect(c[0].amount.toString()).toBe("20");
  });

  it("buying a second challenge gives a second, separate account", async () => {
    const ch = await makeChallenge();
    const p = await makePerson();
    const a = await pay((await start(p.id, ch.id)).id, p.id);
    // The first checkout is paid, so a new one opens for the next purchase.
    const s2 = await start(p.id, ch.id);
    const b = await pay(s2.id, p.id);
    expect(b.account.id).not.toBe(a.account.id);
    expect(await db.account.count({ where: { personId: p.id } })).toBe(2);
  });
});

describe("the account limit setting", () => {
  it("has no effect when unset, and stops a trader at the limit when set; ended accounts don't count", async () => {
    const ch = await makeChallenge();
    const p = await makePerson();
    await pay((await start(p.id, ch.id)).id, p.id);
    await pay((await start(p.id, ch.id)).id, p.id);
    expect(await db.account.count({ where: { personId: p.id } })).toBe(2); // no limit set: fine

    process.env.MAX_ACTIVE_ACCOUNTS = "2";
    try {
      await expect(start(p.id, ch.id)).rejects.toMatchObject({ status: 409 });
      await expect(start(p.id, ch.id)).rejects.toThrow(/most you can hold/);

      // One ends (breached): there is room for another.
      const [first] = await db.account.findMany({ where: { personId: p.id }, orderBy: { createdAt: "asc" } });
      await db.account.update({ where: { id: first.id }, data: { status: "breached", phase: "closed" } });
      await expect(start(p.id, ch.id)).resolves.toBeTruthy();
    } finally {
      delete process.env.MAX_ACTIVE_ACCOUNTS;
    }
  });
});

describe("purchases switched off", () => {
  it("nothing can be started or paid when no payment driver is set", async () => {
    const ch = await makeChallenge();
    const p = await makePerson();
    const s = await start(p.id, ch.id);

    process.env.PAYMENT_DRIVER = "";
    try {
      await expect(start(p.id, ch.id)).rejects.toMatchObject({ status: 503 });
      await expect(pay(s.id, p.id)).rejects.toMatchObject({ status: 503 });
      expect(await db.account.count({ where: { personId: p.id } })).toBe(0);
    } finally {
      process.env.PAYMENT_DRIVER = "demo";
    }
  });
});

describe("a website buyer getting into the portal", () => {
  async function websiteOrder(email: string, challengeId: string) {
    return orders.createOrder({
      orderRef: `WEB-${next()}`,
      fullName: "Wendy Website",
      email,
      country: "CY",
      challengeTypeId: challengeId,
      amountPaid: 200,
      currency: "EUR",
      paymentProvider: "test",
      ipAddress: IP,
    });
  }
  const inviteLink = async (personId: string) => {
    const mail = await db.emailOutbox.findFirstOrThrow({ where: { personId, templateKey: "portal_invite" }, orderBy: { createdAt: "desc" } });
    return mail.body.match(/token=([A-Za-z0-9_-]+)/)![1];
  };

  it("a new buyer gets an email with a link to set a password", async () => {
    const ch = await makeChallenge();
    const email = `wendy${next()}@buy.test`;
    await websiteOrder(email, ch.id);
    const person = await db.person.findUniqueOrThrow({ where: { email } });

    expect(person.passwordHash).toBeNull();
    expect(await db.emailOutbox.count({ where: { personId: person.id, templateKey: "portal_invite" } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "person.portal_invite_sent", entityId: person.id } })).toBe(1);
  });

  it("using the link sets the password, confirms the email, and they can sign in", async () => {
    const ch = await makeChallenge();
    const email = `wendy${next()}@buy.test`;
    await websiteOrder(email, ch.id);
    const person = await db.person.findUniqueOrThrow({ where: { email } });

    // Before: no password, so no way in.
    await expect(auth.loginTrader({ email, password: "Chosen-password-1", ipAddress: IP, userAgent: null })).rejects.toThrow();

    await auth.resetPassword(await inviteLink(person.id), "Chosen-password-1");

    const after = await db.person.findUniqueOrThrow({ where: { id: person.id } });
    expect(after.emailVerifiedAt).toBeInstanceOf(Date);
    const login = await auth.loginTrader({ email, password: "Chosen-password-1", ipAddress: IP, userAgent: null });
    expect(login.person.id).toBe(person.id);
  });

  it("the link works once only", async () => {
    const ch = await makeChallenge();
    const email = `wendy${next()}@buy.test`;
    await websiteOrder(email, ch.id);
    const person = await db.person.findUniqueOrThrow({ where: { email } });
    const token = await inviteLink(person.id);
    await auth.resetPassword(token, "Chosen-password-1");
    await expect(auth.resetPassword(token, "Another-password-2")).rejects.toThrow();
  });

  it("someone who already has a password is not sent an invite on a repeat purchase", async () => {
    const ch = await makeChallenge();
    const p = await makePerson();
    await orders.createOrder({
      orderRef: `WEB-${next()}`,
      fullName: p.fullName,
      email: p.email,
      country: "CY",
      challengeTypeId: ch.id,
      amountPaid: 200,
      currency: "EUR",
      paymentProvider: "test",
      ipAddress: IP,
    });
    expect(await db.emailOutbox.count({ where: { personId: p.id, templateKey: "portal_invite" } })).toBe(0);
  });

  it("a person created some other way, who then resets their password by email, can sign in too", async () => {
    const email = `legacy${next()}@buy.test`;
    const person = await db.person.create({ data: { fullName: "Lee Legacy", email, country: "CY" } });
    await auth.requestPasswordReset(email);
    const mail = await db.emailOutbox.findFirstOrThrow({ where: { personId: person.id, templateKey: "password_reset" } });
    await auth.resetPassword(mail.body.match(/token=([A-Za-z0-9_-]+)/)![1], "Chosen-password-1");

    const login = await auth.loginTrader({ email, password: "Chosen-password-1", ipAddress: IP, userAgent: null });
    expect(login.person.id).toBe(person.id);
  });
});
