import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/test/test-database";

/**
 * Affiliate codes and introduced traders, against a real database: generated
 * codes only, one active code each, nothing made-up earns commission, the first
 * introducer wins, and an affiliate learns nothing about who is a customer.
 * Run with `npm run test:db`.
 */

let testDb: TestDatabase;
let db: typeof import("@/server/db").db;
let createAffiliate: typeof import("@/server/affiliates").createAffiliate;
let setAffiliateStatus: typeof import("@/server/affiliates").setAffiliateStatus;
let createOrder: typeof import("@/server/orders").createOrder;
let registerTrader: typeof import("@/server/auth/trader").registerTrader;
let refs: typeof import("@/server/affiliate-referrals");

const IP = "203.0.113.9";
let n = 0;
const next = () => ++n;

beforeAll(async () => {
  testDb = await createTestDatabase();
  process.env.DATABASE_URL = testDb.url;
  ({ db } = await import("@/server/db"));
  ({ createAffiliate, setAffiliateStatus } = await import("@/server/affiliates"));
  ({ createOrder } = await import("@/server/orders"));
  ({ registerTrader } = await import("@/server/auth/trader"));
  refs = await import("@/server/affiliate-referrals");
});

afterAll(async () => {
  await db?.$disconnect();
  await testDb?.drop();
});

async function makeChallenge() {
  const k = next();
  return db.challengeType.create({
    data: {
      familyId: `fam-${k}`,
      version: 1,
      name: `Challenge ${k}`,
      accountSize: 10000,
      fee: 100,
      leverageCap: 30,
      permittedInstruments: [],
      active: true,
      phases: { create: [{ order: 1, label: "Evaluation", isFunded: false, profitTargetPct: 8, dailyLossPct: 5, maxLossPct: 10 }] },
    },
  });
}

async function makeAffiliate(opts: { generate?: boolean; email?: string } = {}) {
  const k = next();
  const affiliate = await createAffiliate({
    name: `Partner ${k}`,
    email: opts.email ?? `partner${k}@aff.test`,
    commissionPct: "10",
    adminId: "test-admin",
    ipAddress: IP,
  });
  const code = opts.generate === false ? null : (await refs.generateAffiliateCode({ affiliateId: affiliate.id, ipAddress: IP })).code;
  return { affiliate, code };
}

async function buy(opts: { email: string; name?: string; code?: string | null; challengeId: string }) {
  const k = next();
  return createOrder({
    orderRef: `ord-${k}`,
    fullName: opts.name ?? `Buyer ${k}`,
    email: opts.email,
    country: "CY",
    challengeTypeId: opts.challengeId,
    amountPaid: 200,
    currency: "EUR",
    paymentProvider: "test",
    affiliateCode: opts.code ?? null,
    ipAddress: `203.0.113.${100 + (k % 100)}`,
  });
}

const audit = (action: string, entityId: string) => db.auditLog.count({ where: { action, entityId } });
const commissions = (affiliateId: string) => db.affiliateCommission.findMany({ where: { affiliateId } });
const personByEmail = (email: string) => db.person.findUniqueOrThrow({ where: { email } });

describe("generating a referral code", () => {
  it("creates a system-made code, logs it, and shows it in the register", async () => {
    const { affiliate, code } = await makeAffiliate();
    expect(code).toMatch(/^EST-[A-Z2-9]{8}$/);

    const rows = await db.affiliateCode.findMany({ where: { affiliateId: affiliate.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code, origin: "generated", revokedAt: null });
    expect(await audit("affiliate.code_generated", affiliate.id)).toBe(1);
  });

  it("three clicks at the same moment produce exactly one code", async () => {
    const { affiliate } = await makeAffiliate({ generate: false });
    const results = await Promise.allSettled([1, 2, 3].map(() => refs.generateAffiliateCode({ affiliateId: affiliate.id, ipAddress: IP })));

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((x): x is PromiseRejectedResult => x.status === "rejected")) {
      expect(r.reason).toMatchObject({ name: "ValidationError", status: 409 });
    }
    expect(await db.affiliateCode.count({ where: { affiliateId: affiliate.id } })).toBe(1);
    expect(await audit("affiliate.code_generated", affiliate.id)).toBe(1);
  });

  it("the database itself refuses a second active code for one affiliate", async () => {
    const { affiliate } = await makeAffiliate();
    await expect(
      db.affiliateCode.create({ data: { affiliateId: affiliate.id, code: `EST-MANUAL${next()}`, origin: "generated" } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("a suspended affiliate cannot generate one", async () => {
    const { affiliate } = await makeAffiliate({ generate: false });
    await setAffiliateStatus({ id: affiliate.id, status: "suspended", adminId: "test-admin", ipAddress: IP });
    await expect(refs.generateAffiliateCode({ affiliateId: affiliate.id, ipAddress: IP })).rejects.toMatchObject({ status: 403 });
  });
});

describe("only registered codes count", () => {
  it("a made-up code earns nothing and is logged as ignored", async () => {
    const ch = await makeChallenge();
    const { affiliate } = await makeAffiliate();
    const email = `fake${next()}@buyer.test`;
    const { account } = await buy({ email, code: "PARTNER-FAKE-99", challengeId: ch.id });

    expect(await commissions(affiliate.id)).toHaveLength(0);
    const payment = await db.payment.findFirstOrThrow({ where: { accountId: account.id } });
    expect(await audit("affiliate.code_ignored", payment.id)).toBe(1);
    expect(await db.affiliateReferral.count({ where: { email } })).toBe(0);
  });

  it("a valid code earns commission and introduces the buyer", async () => {
    const ch = await makeChallenge();
    const { affiliate, code } = await makeAffiliate();
    const email = `real${next()}@buyer.test`;
    await buy({ email, code, challengeId: ch.id });

    const c = await commissions(affiliate.id);
    expect(c).toHaveLength(1);
    expect(c[0].amount.toString()).toBe("20"); // 10% of 200
    const person = await personByEmail(email);
    expect(await db.affiliateReferral.findUnique({ where: { personId: person.id } })).toMatchObject({ affiliateId: affiliate.id, source: "order_code" });
  });

  it("a deactivated code stops earning, stays on record, and a new one can be generated", async () => {
    const ch = await makeChallenge();
    const { affiliate, code } = await makeAffiliate();
    const old = await db.affiliateCode.findUniqueOrThrow({ where: { code: code! } });

    await refs.revokeAffiliateCode({ codeId: old.id, reason: "Used in a spam campaign", adminId: "staff-1", ipAddress: IP });
    expect(await audit("affiliate.code_revoked", affiliate.id)).toBe(1);
    await expect(refs.revokeAffiliateCode({ codeId: old.id, reason: "again please", adminId: "staff-1", ipAddress: IP })).rejects.toMatchObject({ status: 409 });

    await buy({ email: `late${next()}@buyer.test`, code, challengeId: ch.id });
    expect(await commissions(affiliate.id)).toHaveLength(0);

    const fresh = await refs.generateAffiliateCode({ affiliateId: affiliate.id, ipAddress: IP });
    expect(fresh.code).not.toBe(code);
    // The old code is still on record and still resolves as deactivated, never as free to reuse.
    expect(await db.affiliateCode.findUnique({ where: { code: code! } })).toMatchObject({ revokedAt: expect.any(Date) });
    expect((await refs.resolveCode(code)).kind).toBe("revoked");
    expect((await refs.resolveCode(fresh.code)).kind).toBe("ok");
    expect((await refs.resolveCode("NOPE-NOPE")).kind).toBe("unknown");
  });
});

describe("introduced traders", () => {
  it("registering with a code links the person to the affiliate", async () => {
    const { affiliate, code } = await makeAffiliate();
    const email = `reg${next()}@trader.test`;
    await registerTrader({ fullName: "Rita Registered", email, country: "CY", password: "a-long-password-1", referralCode: code, ipAddress: IP });

    const person = await personByEmail(email);
    expect(await db.affiliateReferral.findUnique({ where: { personId: person.id } })).toMatchObject({ affiliateId: affiliate.id, source: "registration_code" });
  });

  it("an unknown code at registration is ignored and the registration still works", async () => {
    const email = `reg${next()}@trader.test`;
    await registerTrader({ fullName: "Ugo Unknown", email, country: "CY", password: "a-long-password-1", referralCode: "EST-NOTREAL1", ipAddress: IP });
    const person = await personByEmail(email);
    expect(await db.affiliateReferral.findUnique({ where: { personId: person.id } })).toBeNull();
    expect(await audit("affiliate.code_ignored", person.id)).toBe(1);
  });

  it("a person the affiliate recorded is matched when that email registers, with no code at all", async () => {
    const { affiliate } = await makeAffiliate();
    const email = `lead${next()}@trader.test`;
    await refs.recordIntroducedPerson({ affiliateId: affiliate.id, name: "Lena Lead", email, ipAddress: IP });
    expect((await refs.listIntroducedForAffiliate(affiliate.id)).rows[0].stage).toBe("not_signed_up");

    await registerTrader({ fullName: "Lena Lead", email, country: "CY", password: "a-long-password-1", ipAddress: IP });

    const person = await personByEmail(email);
    expect(await db.affiliateReferral.findUnique({ where: { personId: person.id } })).toMatchObject({ affiliateId: affiliate.id, source: "recorded_by_affiliate" });
    expect((await refs.listIntroducedForAffiliate(affiliate.id)).rows[0].stage).toBe("registered");
  });

  it("the first introducer wins: a recorded person who registers with another affiliate's code stays with the first", async () => {
    const a = await makeAffiliate();
    const b = await makeAffiliate();
    const email = `contested${next()}@trader.test`;
    await refs.recordIntroducedPerson({ affiliateId: a.affiliate.id, name: "Cara Contested", email, ipAddress: IP });

    await registerTrader({ fullName: "Cara Contested", email, country: "CY", password: "a-long-password-1", referralCode: b.code, ipAddress: IP });

    const person = await personByEmail(email);
    expect((await db.affiliateReferral.findUnique({ where: { personId: person.id } }))?.affiliateId).toBe(a.affiliate.id);
    expect(await audit("affiliate.referral_ignored", person.id)).toBe(1);
  });

  it("another affiliate's code earns nothing on a trader who was already introduced", async () => {
    const ch = await makeChallenge();
    const a = await makeAffiliate();
    const b = await makeAffiliate();
    const email = `owned${next()}@buyer.test`;
    await buy({ email, code: a.code, challengeId: ch.id });
    await buy({ email, code: b.code, challengeId: ch.id });

    expect(await commissions(a.affiliate.id)).toHaveLength(1);
    expect(await commissions(b.affiliate.id)).toHaveLength(0);
  });

  it("commission is only paid on orders that carry the code", async () => {
    const ch = await makeChallenge();
    const a = await makeAffiliate();
    const email = `repeat${next()}@buyer.test`;
    await buy({ email, code: a.code, challengeId: ch.id });
    await buy({ email, code: null, challengeId: ch.id });

    expect(await commissions(a.affiliate.id)).toHaveLength(1);
  });

  it("two codes racing for the same new trader produce one introducer", async () => {
    const a = await makeAffiliate();
    const b = await makeAffiliate();
    const email = `race${next()}@trader.test`;
    const person = await db.person.create({ data: { fullName: "Rae Race", email, country: "CY" } });

    await Promise.all([
      refs.ensureReferral({ person, affiliate: a.affiliate, codeId: null, source: "registration_code", ipAddress: IP }),
      refs.ensureReferral({ person, affiliate: b.affiliate, codeId: null, source: "registration_code", ipAddress: IP }),
    ]);

    expect(await db.affiliateReferral.count({ where: { personId: person.id } })).toBe(1);
  });

  it("an affiliate cannot introduce themselves", async () => {
    const ch = await makeChallenge();
    const email = `self${next()}@aff.test`;
    const { affiliate, code } = await makeAffiliate({ email });
    await expect(refs.recordIntroducedPerson({ affiliateId: affiliate.id, name: "Me", email, ipAddress: IP })).rejects.toThrow(/own email/);

    await buy({ email, code, challengeId: ch.id });
    const person = await personByEmail(email);
    expect(await db.affiliateReferral.findUnique({ where: { personId: person.id } })).toBeNull();
    // The commission is still created (as before) but held for review.
    const c = await commissions(affiliate.id);
    expect(c).toHaveLength(1);
    expect(c[0].flag).toBeTruthy();
  });

  it("recording a person: the same person twice is refused, two affiliates may each record the same email", async () => {
    const a = await makeAffiliate();
    const b = await makeAffiliate();
    const email = `shared${next()}@trader.test`;
    await refs.recordIntroducedPerson({ affiliateId: a.affiliate.id, name: "Sam Shared", email, ipAddress: IP });
    await expect(refs.recordIntroducedPerson({ affiliateId: a.affiliate.id, name: "Sam Shared", email, ipAddress: IP })).rejects.toMatchObject({ status: 409 });
    // B is told nothing about A having recorded this email.
    await expect(refs.recordIntroducedPerson({ affiliateId: b.affiliate.id, name: "Sam Shared", email, ipAddress: IP })).resolves.toBeTruthy();
  });

  it("an affiliate cannot find out who is already a customer", async () => {
    const ch = await makeChallenge();
    const { affiliate } = await makeAffiliate();
    const customerEmail = `customer${next()}@buyer.test`;
    await buy({ email: customerEmail, name: "Cleo Customer", challengeId: ch.id });

    // Recording an existing customer succeeds exactly like recording a stranger...
    await expect(refs.recordIntroducedPerson({ affiliateId: affiliate.id, name: "Cleo", email: customerEmail, ipAddress: IP })).resolves.toBeTruthy();
    // ...and shows no sign that they are a customer: not matched, no stage, no data.
    const { rows } = await refs.listIntroducedForAffiliate(affiliate.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].stage).toBe("not_signed_up");
    const person = await personByEmail(customerEmail);
    expect(await db.affiliateReferral.findUnique({ where: { personId: person.id } })).toBeNull();
  });

  it("the affiliate's view shows a first name, a masked email and the stage, and nothing more", async () => {
    const ch = await makeChallenge();
    const { affiliate, code } = await makeAffiliate();
    const email = `stages${next()}@trader.test`;
    await registerTrader({ fullName: "Stella Stages Smith", email, country: "CY", password: "a-long-password-1", referralCode: code, ipAddress: IP });

    let view = await refs.listIntroducedForAffiliate(affiliate.id);
    expect(view.rows[0]).toMatchObject({ name: "Stella", maskedEmail: "s***@trader.test", stage: "registered" });
    expect(Object.keys(view.rows[0]).sort()).toEqual(["id", "introducedAt", "maskedEmail", "name", "stage"]);
    expect(JSON.stringify(view)).not.toContain(email);
    expect(JSON.stringify(view)).not.toContain("Smith");

    const { account } = await buy({ email, name: "Stella Stages Smith", code, challengeId: ch.id });
    view = await refs.listIntroducedForAffiliate(affiliate.id);
    expect(view.rows[0].stage).toBe("purchased");

    await db.account.update({ where: { id: account.id }, data: { phase: "funded" } });
    view = await refs.listIntroducedForAffiliate(affiliate.id);
    expect(view.rows[0].stage).toBe("funded");
    expect(view.funnel).toEqual({ introduced: 1, registered: 1, purchased: 1, funded: 1 });

    // Staff see the full record.
    const staff = await refs.listIntroducedForStaff(affiliate.id);
    expect(staff.rows[0]).toMatchObject({ name: "Stella Stages Smith", email, source: "registration_code" });
  });
});
