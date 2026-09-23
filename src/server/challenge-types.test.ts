import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "./db";
import {
  createChallengeType,
  diffChallengeTypeVersions,
  publishChallengeType,
  serializeChallengeType,
  updateChallengeType,
  type ChallengeTypeInput,
} from "./challenge-types";

const testAdminIds: string[] = [];
const testPersonIds: string[] = [];
const testFamilyIds: string[] = [];

async function makeTestAdmin() {
  const role = await db.adminRole.upsert({
    where: { name: "__test_role" },
    update: {},
    create: { name: "__test_role", permissions: [] },
  });
  const admin = await db.adminUser.create({
    data: {
      email: `test-${crypto.randomUUID()}@example.com`,
      name: "Test Admin",
      passwordHash: "unused",
      roleId: role.id,
    },
  });
  testAdminIds.push(admin.id);
  return admin.id;
}

async function makeTestPerson() {
  const person = await db.person.create({
    data: {
      fullName: "Test Trader",
      email: `test-${crypto.randomUUID()}@example.com`,
      country: "CY",
    },
  });
  testPersonIds.push(person.id);
  return person.id;
}

function baseInput(overrides: Partial<ChallengeTypeInput> = {}): ChallengeTypeInput {
  return {
    name: "50K Evaluation",
    productType: "standard",
    accountSize: 50000,
    fee: 300,
    currency: "EUR",
    leverageCap: 100,
    permittedInstruments: ["EURUSD", "GBPUSD"],
    kycTiming: "after_evaluation",
    phases: [
      {
        order: 1,
        label: "Phase 1",
        isFunded: false,
        profitTargetPct: 10,
        dailyLossPct: 5,
        maxLossPct: 10,
        drawdownType: "trailing",
        minTradingDays: 3,
      },
      {
        order: 2,
        label: "Funded",
        isFunded: true,
        dailyLossPct: 5,
        maxLossPct: 10,
        drawdownType: "trailing",
        minTradingDays: 0,
        profitSplitPct: 80,
        payoutCycleDays: 14,
      },
    ],
    ...overrides,
  };
}

afterAll(async () => {
  // Order matters: children before parents.
  await db.termsAcceptance.deleteMany({ where: { personId: { in: testPersonIds } } });
  await db.account.deleteMany({ where: { personId: { in: testPersonIds } } });
  await db.challengePhase.deleteMany({ where: { challengeType: { familyId: { in: testFamilyIds } } } });
  await db.challengeType.deleteMany({ where: { familyId: { in: testFamilyIds } } });
  await db.person.deleteMany({ where: { id: { in: testPersonIds } } });
  await db.adminUser.deleteMany({ where: { id: { in: testAdminIds } } });
  await db.adminRole.deleteMany({ where: { name: "__test_role" } });
  await db.$disconnect();
});

describe("challenge type versioning", () => {
  it("creates a draft at version 1, inactive", async () => {
    const adminId = await makeTestAdmin();
    const type = await createChallengeType(baseInput(), adminId);
    testFamilyIds.push(type.familyId);

    expect(type.version).toBe(1);
    expect(type.active).toBe(false);
    expect(type.phases).toHaveLength(2);
  });

  it("publishing makes it the active version for its family", async () => {
    const adminId = await makeTestAdmin();
    const type = await createChallengeType(baseInput(), adminId);
    testFamilyIds.push(type.familyId);

    const published = await publishChallengeType(type.id, adminId);
    expect(published.active).toBe(true);
    expect(published.publishedAt).not.toBeNull();
  });

  it("editing a type with zero accounts changes it in place", async () => {
    const adminId = await makeTestAdmin();
    const type = await createChallengeType(baseInput(), adminId);
    testFamilyIds.push(type.familyId);

    const updated = await updateChallengeType(
      type.id,
      baseInput({ name: "50K Evaluation (renamed)" }),
      adminId,
    );

    expect(updated.id).toBe(type.id);
    expect(updated.version).toBe(1);
    expect(updated.name).toBe("50K Evaluation (renamed)");
  });

  it("editing a type WITH a live account creates a new version and leaves the account's terms untouched", async () => {
    const adminId = await makeTestAdmin();
    const personId = await makeTestPerson();

    const v1 = await createChallengeType(baseInput({ name: "100K Evaluation" }), adminId);
    testFamilyIds.push(v1.familyId);
    await publishChallengeType(v1.id, adminId);

    // Simulate a purchase pinning an account to v1.
    const account = await db.account.create({
      data: {
        personId,
        challengeTypeId: v1.id,
        currentPhaseId: v1.phases[0].id,
        orderRef: `TEST-${crypto.randomUUID()}`,
        equity: 100000,
        balance: 100000,
        dayStartEquity: 100000,
        peakEquity: 100000,
      },
    });

    // Founder changes the profit target — this must NOT alter v1.
    const v2 = await updateChallengeType(
      v1.id,
      baseInput({
        name: "100K Evaluation",
        phases: baseInput().phases.map((p) =>
          p.order === 1 ? { ...p, profitTargetPct: 12 } : p,
        ),
      }),
      adminId,
    );

    expect(v2.id).not.toBe(v1.id);
    expect(v2.familyId).toBe(v1.familyId);
    expect(v2.version).toBe(2);
    expect(v2.active).toBe(true); // v1 was live, so v2 immediately supersedes it
    expect(v2.phases.find((p) => p.order === 1)?.profitTargetPct?.toString()).toBe("12");

    // The old version is now inactive (not sellable)...
    const v1Reloaded = await db.challengeType.findUniqueOrThrow({
      where: { id: v1.id },
      include: { phases: { orderBy: { order: "asc" } } },
    });
    expect(v1Reloaded.active).toBe(false);
    // ...but its own rules are untouched.
    expect(v1Reloaded.phases.find((p) => p.order === 1)?.profitTargetPct?.toString()).toBe("10");

    // The account bought under v1 is still pinned to v1, not v2.
    const accountReloaded = await db.account.findUniqueOrThrow({ where: { id: account.id } });
    expect(accountReloaded.challengeTypeId).toBe(v1.id);
  });

  it("diff reports the fields that actually changed between two versions", async () => {
    const adminId = await makeTestAdmin();
    const personId = await makeTestPerson();

    const v1 = await createChallengeType(baseInput({ name: "Diff Test", fee: 300 }), adminId);
    testFamilyIds.push(v1.familyId);
    await publishChallengeType(v1.id, adminId);

    await db.account.create({
      data: {
        personId,
        challengeTypeId: v1.id,
        orderRef: `TEST-${crypto.randomUUID()}`,
        equity: 50000,
        balance: 50000,
        dayStartEquity: 50000,
        peakEquity: 50000,
      },
    });

    const v2 = await updateChallengeType(v1.id, baseInput({ name: "Diff Test", fee: 350 }), adminId);

    const changes = diffChallengeTypeVersions(
      serializeChallengeType(v1),
      serializeChallengeType(v2),
    );
    const feeChange = changes.find((c) => c.field === "fee");
    expect(feeChange).toEqual({ field: "fee", before: "300", after: "350" });
  });
});
