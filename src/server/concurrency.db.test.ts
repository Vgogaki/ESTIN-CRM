import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/test/test-database";

/**
 * Competing actions on the same record, run for real against Postgres: every
 * case fires the actions at the same moment (Promise.all) and then checks that
 * exactly one of them took effect, that the audit log says so exactly once, and
 * that nobody was told something that did not happen.
 *
 * Run with `npm run test:db`. See src/test/test-database.ts for how the
 * throwaway database is made.
 */

let testDb: TestDatabase;
let db: typeof import("@/server/db").db;
let requestWithdrawal: typeof import("@/server/withdrawals").requestWithdrawal;
let decideWithdrawal: typeof import("@/server/withdrawals").decideWithdrawal;
let advanceAccount: typeof import("@/server/traders").advanceAccount;
let updateAccountState: typeof import("@/server/traders").updateAccountState;
let voidAccount: typeof import("@/server/traders").voidAccount;
let runExpirySweep: typeof import("@/server/jobs/expire-accounts").runExpirySweep;

let counter = 0;
const next = () => ++counter;
const IP = "203.0.113.9";

beforeAll(async () => {
  testDb = await createTestDatabase();
  process.env.DATABASE_URL = testDb.url;
  ({ db } = await import("@/server/db"));
  ({ requestWithdrawal, decideWithdrawal } = await import("@/server/withdrawals"));
  ({ advanceAccount, updateAccountState, voidAccount } = await import("@/server/traders"));
  ({ runExpirySweep } = await import("@/server/jobs/expire-accounts"));
});

afterAll(async () => {
  await db?.$disconnect();
  await testDb?.drop();
});

/** A challenge with one evaluation phase (30-day limit) and a funded phase (80% split, 50 minimum payout). */
async function makeChallenge() {
  const n = next();
  return db.challengeType.create({
    data: {
      familyId: `family-${n}`,
      version: 1,
      name: `Test challenge ${n}`,
      accountSize: 10000,
      fee: 100,
      leverageCap: 30,
      permittedInstruments: [],
      active: true,
      phases: {
        create: [
          { order: 1, label: "Evaluation", isFunded: false, profitTargetPct: 8, dailyLossPct: 5, maxLossPct: 10, timeLimitDays: 30 },
          { order: 2, label: "Funded", isFunded: true, dailyLossPct: 5, maxLossPct: 10, profitSplitPct: 80, minPayoutAmount: 50 },
        ],
      },
    },
    include: { phases: { orderBy: { order: "asc" } } },
  });
}

async function makeAdmin() {
  const n = next();
  const role = await db.adminRole.upsert({ where: { name: "test-role" }, update: {}, create: { name: "test-role", permissions: [] } });
  return db.adminUser.create({ data: { email: `admin${n}@concurrency.test`, name: `Admin ${n}`, roleId: role.id, passwordHash: "not-a-real-hash" } });
}

async function makeAccount(opts: {
  phase: "evaluation" | "pass_review" | "funded";
  equity?: number;
  phaseStartedAt?: Date;
  kycStatus?: "verified" | "not_started";
}) {
  const n = next();
  const challenge = await makeChallenge();
  const person = await db.person.create({
    data: {
      fullName: `Trader ${n}`,
      email: `trader${n}@concurrency.test`,
      country: "CY",
      kycStatus: opts.kycStatus ?? "verified",
      twoFactorEnabledAt: new Date(),
    },
  });
  const phaseRow = opts.phase === "funded" ? challenge.phases[1] : challenge.phases[0];
  const equity = opts.equity ?? 10000;
  const account = await db.account.create({
    data: {
      personId: person.id,
      challengeTypeId: challenge.id,
      currentPhaseId: phaseRow.id,
      orderRef: `order-${n}`,
      phase: opts.phase,
      equity,
      balance: equity,
      dayStartEquity: equity,
      peakEquity: equity,
      ...(opts.phaseStartedAt ? { phaseStartedAt: opts.phaseStartedAt } : {}),
    },
  });
  return { challenge, person, account };
}

const auditCount = (entityId: string, action: string) => db.auditLog.count({ where: { entityId, action } });

type Settled = PromiseSettledResult<unknown>;
const fulfilled = (r: Settled[]) => r.filter((x) => x.status === "fulfilled").length;
const rejections = (r: Settled[]) => r.filter((x): x is PromiseRejectedResult => x.status === "rejected").map((x) => x.reason);

describe("requesting a payout", () => {
  it("two requests at the same moment create exactly one payout", async () => {
    const { account, person } = await makeAccount({ phase: "funded", equity: 11000 });

    const results = await Promise.allSettled([
      requestWithdrawal({ personId: person.id, accountId: account.id, ipAddress: IP }),
      requestWithdrawal({ personId: person.id, accountId: account.id, ipAddress: IP }),
      requestWithdrawal({ personId: person.id, accountId: account.id, ipAddress: IP }),
    ]);

    expect(fulfilled(results)).toBe(1);
    expect(rejections(results)).toHaveLength(2);
    for (const reason of rejections(results)) {
      expect(reason).toMatchObject({ name: "ValidationError", status: 409 });
    }

    const rows = await db.withdrawal.findMany({ where: { accountId: account.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
    // 1,000 profit at an 80% split.
    expect(rows[0].amount.toString()).toBe("800");
    expect(await auditCount(rows[0].id, "withdrawal.requested")).toBe(1);
    expect(await db.notification.count({ where: { personId: person.id, type: "payout_requested" } })).toBe(1);
  });

  it("the database itself refuses a second pending payout for an account", async () => {
    const { account } = await makeAccount({ phase: "funded", equity: 11000 });
    const data = { accountId: account.id, profit: 1000, splitPct: 80, amount: 800 };

    await db.withdrawal.create({ data });
    await expect(db.withdrawal.create({ data })).rejects.toMatchObject({ code: "P2002" });

    // A decided payout does not count: after a decline, a new request is allowed.
    await db.withdrawal.updateMany({ where: { accountId: account.id }, data: { status: "declined" } });
    await expect(db.withdrawal.create({ data })).resolves.toBeTruthy();
  });

  it("a payout request racing a void is either refused or recorded before the void, never lost", async () => {
    const { account, person } = await makeAccount({ phase: "funded", equity: 11000 });
    const admin = await makeAdmin();

    const results = await Promise.allSettled([
      requestWithdrawal({ personId: person.id, accountId: account.id, ipAddress: IP }),
      voidAccount({ accountId: account.id, reason: "Duplicate purchase", adminId: admin.id, ipAddress: IP }),
    ]);

    // The void always lands. The request either went first (one pending payout)
    // or was refused because the account was already voided (none).
    expect(results[1].status).toBe("fulfilled");
    const pending = await db.withdrawal.count({ where: { accountId: account.id } });
    expect(pending).toBe(results[0].status === "fulfilled" ? 1 : 0);
    expect(await auditCount(account.id, "account.voided")).toBe(1);
  });
});

describe("deciding a payout", () => {
  async function pendingPayout() {
    const made = await makeAccount({ phase: "funded", equity: 11000 });
    const withdrawal = await requestWithdrawal({ personId: made.person.id, accountId: made.account.id, ipAddress: IP });
    return { ...made, withdrawal };
  }

  it("an approve and a decline at the same moment produce exactly one decision", async () => {
    const { withdrawal, person } = await pendingPayout();
    const [a, b] = [await makeAdmin(), await makeAdmin()];

    const results = await Promise.allSettled([
      decideWithdrawal({ withdrawalId: withdrawal.id, adminId: a.id, decision: "approved", ipAddress: IP }),
      decideWithdrawal({ withdrawalId: withdrawal.id, adminId: b.id, decision: "declined", note: "Looks wrong", ipAddress: IP }),
    ]);

    expect(fulfilled(results)).toBe(1);
    const [loser] = rejections(results);
    expect(loser).toMatchObject({ name: "ValidationError", status: 409 });

    const final = await db.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } });
    expect(["approved", "declined"]).toContain(final.status);

    const decisionEntries =
      (await auditCount(withdrawal.id, "withdrawal.approved")) + (await auditCount(withdrawal.id, "withdrawal.declined"));
    expect(decisionEntries).toBe(1);
    // The trader is told once, and what they are told matches what happened.
    const notices = await db.notification.findMany({ where: { personId: person.id, type: { in: ["payout_approved", "payout_declined"] } } });
    expect(notices).toHaveLength(1);
    expect(notices[0].type).toBe(final.status === "approved" ? "payout_approved" : "payout_declined");
  });

  it("two approvals at the same moment produce one approval", async () => {
    const { withdrawal } = await pendingPayout();
    const [a, b] = [await makeAdmin(), await makeAdmin()];

    const results = await Promise.allSettled([
      decideWithdrawal({ withdrawalId: withdrawal.id, adminId: a.id, decision: "approved", ipAddress: IP }),
      decideWithdrawal({ withdrawalId: withdrawal.id, adminId: b.id, decision: "approved", ipAddress: IP }),
    ]);

    expect(fulfilled(results)).toBe(1);
    expect(await auditCount(withdrawal.id, "withdrawal.approved")).toBe(1);
  });

  it("a payout cannot be approved when KYC is withdrawn at the same moment: whichever came second wins consistently", async () => {
    const { withdrawal, person } = await pendingPayout();
    const admin = await makeAdmin();
    const { setKycStatus } = await import("@/server/traders");
    const other = await makeAdmin();

    const results = await Promise.allSettled([
      decideWithdrawal({ withdrawalId: withdrawal.id, adminId: admin.id, decision: "approved", ipAddress: IP }),
      setKycStatus({ personId: person.id, status: "rejected", reason: "Document unreadable", adminId: other.id, ipAddress: IP }),
    ]);

    // The KYC change always lands.
    expect(results[1].status).toBe("fulfilled");
    const final = await db.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } });
    const approvals = await auditCount(withdrawal.id, "withdrawal.approved");
    // If the payout was approved, the audit log shows the approval came while KYC was still verified;
    // if KYC was rejected first, the approval was refused. Never an approval without an audit entry or vice versa.
    expect(approvals).toBe(final.status === "approved" ? 1 : 0);
    expect(results[0].status).toBe(final.status === "approved" ? "fulfilled" : "rejected");
  });
});

describe("moving an account to its next phase", () => {
  it("two 'advance' actions at the same moment move the account once", async () => {
    const { account, challenge } = await makeAccount({ phase: "pass_review" });
    const [a, b] = [await makeAdmin(), await makeAdmin()];

    const results = await Promise.allSettled([
      advanceAccount({ accountId: account.id, adminId: a.id, ipAddress: IP, resetEquity: true }),
      advanceAccount({ accountId: account.id, adminId: b.id, ipAddress: IP, resetEquity: true }),
    ]);

    expect(fulfilled(results)).toBe(1);
    expect(rejections(results)).toHaveLength(1);

    const final = await db.account.findUniqueOrThrow({ where: { id: account.id } });
    expect(final.phase).toBe("funded");
    expect(final.currentPhaseId).toBe(challenge.phases[1].id);
    expect(await auditCount(account.id, "account.advanced")).toBe(1);
    expect(await db.notification.count({ where: { personId: account.personId, type: "phase_passed" } })).toBe(1);
  });
});

describe("the time-limit sweep", () => {
  const longAgo = () => new Date(Date.now() - 40 * 24 * 3600 * 1000);

  it("two sweeps at the same moment close an expired account once", async () => {
    const { account } = await makeAccount({ phase: "evaluation", phaseStartedAt: longAgo() });

    const results = await Promise.all([runExpirySweep(), runExpirySweep()]);

    expect(results.reduce((n, r) => n + r.closed, 0)).toBe(1);
    const final = await db.account.findUniqueOrThrow({ where: { id: account.id } });
    expect(final.status).toBe("closed");
    expect(await auditCount(account.id, "account.auto_expired")).toBe(1);
    expect(await db.notification.count({ where: { personId: account.personId, type: "account_expired" } })).toBe(1);
  });

  it("does not overwrite an account that was breached while the sweep was running", async () => {
    const { account } = await makeAccount({ phase: "evaluation", phaseStartedAt: longAgo(), equity: 10000 });
    const admin = await makeAdmin();

    // 8,000 on a 10,000 account breaches the 10% max-loss rule.
    await Promise.allSettled([
      runExpirySweep(),
      updateAccountState({ accountId: account.id, adminId: admin.id, ipAddress: IP, reason: "Manual equity entry", patch: { equity: 8000 } }),
    ]);

    const final = await db.account.findUniqueOrThrow({ where: { id: account.id } });
    const breached = await auditCount(account.id, "account.auto_breached");
    const expired = await auditCount(account.id, "account.auto_expired");

    // Exactly one automatic closure, and it is the one the account's state says happened.
    expect(breached + expired).toBe(1);
    expect(final.status).toBe(breached === 1 ? "breached" : "closed");
  });
});

describe("manual overrides", () => {
  it("two overrides at the same moment leave an unbroken before/after chain in the audit log", async () => {
    const { account } = await makeAccount({ phase: "funded", equity: 10000 });
    const [a, b] = [await makeAdmin(), await makeAdmin()];

    await Promise.all([
      updateAccountState({ accountId: account.id, adminId: a.id, ipAddress: IP, reason: "Entry from platform A", patch: { equity: 10100 } }),
      updateAccountState({ accountId: account.id, adminId: b.id, ipAddress: IP, reason: "Entry from platform B", patch: { equity: 10200 } }),
    ]);

    const entries = await db.auditLog.findMany({ where: { entityId: account.id, action: "account.manual_override" } });
    expect(entries).toHaveLength(2);

    const equityOf = (v: unknown) => (v as { equity: string }).equity;
    const first = entries.find((e) => equityOf(e.before) === "10000");
    const second = entries.find((e) => e !== first);
    expect(first).toBeDefined();
    // The second override's "before" is exactly the first one's "after": no lost update.
    expect(equityOf(second!.before)).toBe(equityOf(first!.after));

    const final = await db.account.findUniqueOrThrow({ where: { id: account.id } });
    expect(final.equity.toString()).toBe(equityOf(second!.after));
  });

  it("two voids at the same moment record one void", async () => {
    const { account } = await makeAccount({ phase: "evaluation" });
    const [a, b] = [await makeAdmin(), await makeAdmin()];

    const results = await Promise.allSettled([
      voidAccount({ accountId: account.id, reason: "First reason", adminId: a.id, ipAddress: IP }),
      voidAccount({ accountId: account.id, reason: "Second reason", adminId: b.id, ipAddress: IP }),
    ]);

    expect(fulfilled(results)).toBe(1);
    expect(await auditCount(account.id, "account.voided")).toBe(1);
    const final = await db.account.findUniqueOrThrow({ where: { id: account.id } });
    expect(final.voidReason).toBe(final.voidedById === a.id ? "First reason" : "Second reason");
  });
});
