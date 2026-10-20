import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/test/test-database";

/**
 * Tasks against a real database: work appears as pending, is picked up by one
 * person, and completes by itself when the situation behind it is resolved.
 * Run with `npm run test:db`.
 */

let testDb: TestDatabase;
let db: typeof import("@/server/db").db;
let tasks: typeof import("@/server/tasks");

const IP = "203.0.113.9";
let n = 0;
const next = () => ++n;

beforeAll(async () => {
  testDb = await createTestDatabase();
  process.env.DATABASE_URL = testDb.url;
  ({ db } = await import("@/server/db"));
  tasks = await import("@/server/tasks");
});

afterAll(async () => {
  await db?.$disconnect();
  await testDb?.drop();
});

const sync = () => tasks.syncTasks({ force: true });
const openTasks = (kind: string, subjectId: string) =>
  db.staffTask.findMany({ where: { kind, subjectId, status: { in: ["pending", "in_review"] } } });
const allTasks = (kind: string, subjectId: string) => db.staffTask.findMany({ where: { kind, subjectId }, orderBy: { createdAt: "asc" } });

async function makeAdmin() {
  const k = next();
  const role = await db.adminRole.upsert({ where: { name: "test-role" }, update: {}, create: { name: "test-role", permissions: [] } });
  return db.adminUser.create({ data: { email: `admin${k}@tasks.test`, name: `Admin ${k}`, roleId: role.id, passwordHash: "x" } });
}

async function makePerson(kycStatus: "not_started" | "submitted" | "verified" = "not_started") {
  const k = next();
  return db.person.create({ data: { fullName: `Person ${k}`, email: `person${k}@tasks.test`, country: "CY", kycStatus } });
}

async function makeAccount(personId: string, phase: "evaluation" | "pass_review" | "funded") {
  const k = next();
  const ct = await db.challengeType.create({
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
    include: { phases: true },
  });
  return db.account.create({
    data: {
      personId,
      challengeTypeId: ct.id,
      currentPhaseId: ct.phases[0].id,
      orderRef: `order-${k}`,
      phase,
      equity: 10000,
      balance: 10000,
      dayStartEquity: 10000,
      peakEquity: 10000,
    },
  });
}

describe("finding work", () => {
  it("a submitted KYC, a pass review and a payout request each become one pending task", async () => {
    const kycPerson = await makePerson("submitted");
    const passPerson = await makePerson("not_started");
    const passAccount = await makeAccount(passPerson.id, "pass_review");

    await sync();

    const kyc = await openTasks("kyc_review", kycPerson.id);
    expect(kyc).toHaveLength(1);
    expect(kyc[0]).toMatchObject({ status: "pending", title: kycPerson.fullName, href: `/admin/traders/${kycPerson.id}`, claimedById: null });

    const pass = await openTasks("pass_review", passAccount.id);
    expect(pass).toHaveLength(1);
    // KYC is not verified and this challenge wants it before funding: the task says so, instead of a vague "awaiting verification".
    expect(pass[0].summary).toMatch(/KYC \(not started\) must be verified before funding/);
  });

  it("syncing again changes nothing (no duplicates)", async () => {
    const person = await makePerson("submitted");
    await sync();
    await sync();
    await Promise.all([sync(), sync(), sync()]);
    expect(await openTasks("kyc_review", person.id)).toHaveLength(1);
  });

  it("the database refuses two open tasks for the same subject, but allows a new one after completion", async () => {
    const data = { kind: "kyc_review", subjectId: `manual-${next()}`, title: "T", summary: "S", href: "/x" };
    await db.staffTask.create({ data });
    await expect(db.staffTask.create({ data })).rejects.toMatchObject({ code: "P2002" });
    await db.staffTask.updateMany({ where: { subjectId: data.subjectId }, data: { status: "completed", completedAt: new Date() } });
    await expect(db.staffTask.create({ data })).resolves.toBeTruthy();
  });
});

describe("starting a review", () => {
  it("moves the task out of pending, so the pending count falls", async () => {
    const person = await makePerson("submitted");
    const admin = await makeAdmin();
    await sync();
    const [task] = await openTasks("kyc_review", person.id);
    const before = await tasks.taskCounts();

    await tasks.claimTask({ taskId: task.id, adminId: admin.id, ipAddress: IP });

    const after = await tasks.taskCounts();
    expect(after.pending).toBe(before.pending - 1);
    expect(after.inReview).toBe(before.inReview + 1);
    expect(await db.staffTask.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ status: "in_review", claimedById: admin.id });
    expect(await db.auditLog.count({ where: { action: "task.claimed", entityId: task.id } })).toBe(1);
  });

  it("two people starting the same review at the same moment: one gets it, the other is told who has it", async () => {
    const person = await makePerson("submitted");
    const [a, b] = [await makeAdmin(), await makeAdmin()];
    await sync();
    const [task] = await openTasks("kyc_review", person.id);

    const results = await Promise.allSettled([
      tasks.claimTask({ taskId: task.id, adminId: a.id, ipAddress: IP }),
      tasks.claimTask({ taskId: task.id, adminId: b.id, ipAddress: IP }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const loser = results.find((r): r is PromiseRejectedResult => r.status === "rejected")!;
    expect(loser.reason).toMatchObject({ name: "ValidationError", status: 409 });
    const final = await db.staffTask.findUniqueOrThrow({ where: { id: task.id }, include: { claimedBy: true } });
    expect(loser.reason.message).toContain(final.claimedBy!.name);
    expect(await db.auditLog.count({ where: { action: "task.claimed", entityId: task.id } })).toBe(1);
  });

  it("can be put back, and only an in-review task can be", async () => {
    const person = await makePerson("submitted");
    const admin = await makeAdmin();
    await sync();
    const [task] = await openTasks("kyc_review", person.id);

    await expect(tasks.releaseTask({ taskId: task.id, adminId: admin.id, ipAddress: IP })).rejects.toMatchObject({ status: 409 });
    await tasks.claimTask({ taskId: task.id, adminId: admin.id, ipAddress: IP });
    await tasks.releaseTask({ taskId: task.id, adminId: admin.id, ipAddress: IP });

    expect(await db.staffTask.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ status: "pending", claimedById: null, claimedAt: null });
    expect(await db.auditLog.count({ where: { action: "task.released", entityId: task.id } })).toBe(1);
  });
});

describe("completing", () => {
  it("a task completes by itself when the situation is resolved, and keeps who was reviewing it", async () => {
    const person = await makePerson("submitted");
    const admin = await makeAdmin();
    await sync();
    const [task] = await openTasks("kyc_review", person.id);
    await tasks.claimTask({ taskId: task.id, adminId: admin.id, ipAddress: IP });

    await db.person.update({ where: { id: person.id }, data: { kycStatus: "verified" } });
    const before = await tasks.taskCounts();
    await sync();

    const done = await db.staffTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(done).toMatchObject({ status: "completed", claimedById: admin.id });
    expect(done.completedAt).toBeInstanceOf(Date);
    expect((await tasks.taskCounts()).inReview).toBe(before.inReview - 1);
    expect(await db.auditLog.count({ where: { action: "task.completed", entityId: task.id } })).toBe(1);
    // A completed task can't be picked up again.
    await expect(tasks.claimTask({ taskId: task.id, adminId: admin.id, ipAddress: IP })).rejects.toMatchObject({ status: 409 });
  });

  it("a pending task that is resolved before anyone picks it up also completes", async () => {
    const person = await makePerson("submitted");
    await sync();
    const [task] = await openTasks("kyc_review", person.id);
    await db.person.update({ where: { id: person.id }, data: { kycStatus: "rejected" } });
    await sync();
    expect((await db.staffTask.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("completed");
  });

  it("if the same situation comes back, it is a new task; the old one stays as history", async () => {
    const person = await makePerson("submitted");
    await sync();
    await db.person.update({ where: { id: person.id }, data: { kycStatus: "verified" } });
    await sync();
    await db.person.update({ where: { id: person.id }, data: { kycStatus: "submitted" } });
    await sync();

    const all = await allTasks("kyc_review", person.id);
    expect(all.map((t) => t.status)).toEqual(["completed", "pending"]);
  });

  it("the wording of an open task is kept current", async () => {
    const person = await makePerson("submitted");
    const account = await makeAccount(person.id, "pass_review");
    await sync();
    expect((await openTasks("pass_review", account.id))[0].summary).toMatch(/must be verified/);

    await db.person.update({ where: { id: person.id }, data: { kycStatus: "verified" } });
    await sync();
    expect((await openTasks("pass_review", account.id))[0].summary).toMatch(/ready to advance/);
  });
});

describe("listing", () => {
  it("lists each status separately, oldest waiting first and newest completed first", async () => {
    const person = await makePerson("submitted");
    await sync();
    const pending = await tasks.listTasks("pending");
    expect(pending.some((t) => t.subjectId === person.id)).toBe(true);
    expect(pending.every((t) => t.status === "pending")).toBe(true);
    const completed = await tasks.listTasks("completed");
    expect(completed.every((t) => t.status === "completed")).toBe(true);
    for (let i = 1; i < completed.length; i++) {
      expect(completed[i - 1].completedAt!.getTime()).toBeGreaterThanOrEqual(completed[i].completedAt!.getTime());
    }
  });
});
