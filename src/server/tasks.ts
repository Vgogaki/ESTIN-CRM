import type { StaffTaskStatus } from "@prisma/client";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { ValidationError } from "@/server/errors";
import { getPendingTasks } from "@/server/pending-tasks";
import { hasPermission, type Permission } from "@/server/permissions";

/**
 * Tasks: work waiting on the team, with a status the team can see and move.
 *
 *  - The WORK is derived automatically from the state of accounts, KYC, payouts,
 *    support threads etc. (pending-tasks.ts). Nobody creates a task by hand.
 *  - pending     nobody has picked it up. This is the number beside "Tasks".
 *  - in review   a named person has taken it ("Start review").
 *  - completed   the underlying situation is resolved. Set by the system when the
 *                work disappears (KYC decided, payout decided, account advanced...),
 *                never by hand, so a task can't be "completed" while its problem
 *                is still there.
 *  Picking a task up, or putting it back, is audited. Rows are never deleted.
 */

export type TaskKind =
  | "rule_breach"
  | "ready_to_pass"
  | "pass_review"
  | "kyc_review"
  | "funded_without_kyc"
  | "identity_mismatch"
  | "offer_lead"
  | "support_reply"
  | "risk_flag"
  | "linked_accounts"
  | "country_review"
  | "payout_decision";

export const KIND_LABEL: Record<TaskKind, string> = {
  rule_breach: "Rule breach",
  ready_to_pass: "Ready to pass",
  pass_review: "Pass review",
  kyc_review: "KYC review",
  funded_without_kyc: "Funded without KYC",
  identity_mismatch: "Identity mismatch",
  offer_lead: "Re-purchase offer",
  support_reply: "Support reply",
  risk_flag: "Risk flag",
  linked_accounts: "Linked accounts",
  country_review: "Country review",
  payout_decision: "Payout decision",
};

export type TaskTone = "danger" | "success" | "accent";

export type Candidate = {
  kind: TaskKind;
  subjectId: string;
  title: string;
  summary: string;
  href: string;
  tone: TaskTone;
};

type Derived = Awaited<ReturnType<typeof getPendingTasks>>;

/** Turns the derived buckets into one flat list of tasks (pure: no database). */
export function candidatesFrom(t: Derived): Candidate[] {
  const out: Candidate[] = [];
  const trader = (personId: string) => `/admin/traders/${personId}`;

  for (const a of t.flagged) {
    out.push({ kind: "rule_breach", subjectId: a.id, title: a.person.fullName, summary: `${a.challengeType.name} · loss limit exceeded`, href: trader(a.personId), tone: "danger" });
  }
  for (const a of t.readyToPass) {
    out.push({ kind: "ready_to_pass", subjectId: a.id, title: a.person.fullName, summary: `${a.challengeType.name} · profit target met`, href: trader(a.personId), tone: "success" });
  }
  for (const a of t.passReview) {
    // Whether KYC blocks the next step depends on when this challenge asks for it.
    const waitingOnKyc = a.person.kycStatus !== "verified" && a.challengeType.kycTiming !== "at_first_payout";
    out.push({
      kind: "pass_review",
      subjectId: a.id,
      title: a.person.fullName,
      summary: waitingOnKyc
        ? `${a.challengeType.name} · target reached; KYC (${a.person.kycStatus.replace(/_/g, " ")}) must be verified before funding`
        : `${a.challengeType.name} · target reached; ready to advance to the next phase`,
      href: trader(a.personId),
      tone: "accent",
    });
  }
  for (const p of t.kycSubmitted) {
    out.push({ kind: "kyc_review", subjectId: p.id, title: p.fullName, summary: "Identity documents uploaded: review and decide", href: trader(p.id), tone: "accent" });
  }
  for (const a of t.fundedWithoutKyc) {
    out.push({ kind: "funded_without_kyc", subjectId: a.id, title: a.person.fullName, summary: `Funded account, KYC: ${a.person.kycStatus.replace(/_/g, " ")}`, href: trader(a.personId), tone: "danger" });
  }
  for (const p of t.identityFlags) {
    out.push({ kind: "identity_mismatch", subjectId: p.id, title: p.fullName, summary: `Name differs from a previous order (${p.email})`, href: trader(p.id), tone: "danger" });
  }
  for (const a of t.offerLeads) {
    out.push({ kind: "offer_lead", subjectId: a.personId, title: a.person.fullName, summary: "Breached; no re-purchase offer sent yet", href: "/admin/offers", tone: "accent" });
  }
  for (const th of t.supportThreads) {
    out.push({ kind: "support_reply", subjectId: th.id, title: th.person.fullName, summary: th.subject, href: `/admin/support/${th.id}`, tone: "accent" });
  }
  for (const f of t.riskFlags) {
    out.push({ kind: "risk_flag", subjectId: f.id, title: f.person.fullName, summary: `[${f.severity}] ${f.summary}`, href: trader(f.personId), tone: "danger" });
  }
  for (const l of t.linkedAccounts) {
    const signals = (l.signals as { type: string }[]).map((s) => s.type.replace(/_/g, " ")).join(", ");
    out.push({ kind: "linked_accounts", subjectId: l.id, title: `${l.personA.fullName} ↔ ${l.personB.fullName}`, summary: signals || "Possible linked accounts", href: trader(l.personAId), tone: "danger" });
  }
  for (const r of t.countryReviews) {
    out.push({ kind: "country_review", subjectId: r.id, title: r.person.fullName, summary: `${r.countryCode} · ${r.stage}`, href: "/admin/countries", tone: "danger" });
  }
  for (const w of t.pendingWithdrawals) {
    out.push({ kind: "payout_decision", subjectId: w.id, title: w.account.person.fullName, summary: `${w.amount.toString()} ${w.account.challengeType.currency} payout request`, href: "/admin/withdrawals", tone: "accent" });
  }
  return out;
}

const isUniqueViolation = (err: unknown) => err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002";
const OPEN: StaffTaskStatus[] = ["pending", "in_review"];

async function runSync(): Promise<void> {
  const candidates = candidatesFrom(await getPendingTasks());
  const wanted = new Map(candidates.map((c) => [`${c.kind}:${c.subjectId}`, c]));
  const open = await db.staffTask.findMany({ where: { status: { in: OPEN } } });
  const have = new Map(open.map((t) => [`${t.kind}:${t.subjectId}`, t]));

  // New work: a pending task. The database allows only one open task per subject, so two
  // syncs running at the same moment cannot create duplicates; the loser's insert is ignored.
  for (const [key, c] of wanted) {
    if (have.has(key)) continue;
    try {
      await db.staffTask.create({ data: { kind: c.kind, subjectId: c.subjectId, title: c.title, summary: c.summary, href: c.href, tone: c.tone } });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }

  // Work that is gone: the underlying situation was resolved, so the task is completed.
  for (const [key, t] of have) {
    if (wanted.has(key)) {
      // Still there: keep its wording current (an amount or a KYC status may have changed).
      const c = wanted.get(key)!;
      if (t.title !== c.title || t.summary !== c.summary || t.href !== c.href || t.tone !== c.tone) {
        await db.staffTask.updateMany({ where: { id: t.id, status: { in: OPEN } }, data: { title: c.title, summary: c.summary, href: c.href, tone: c.tone } });
      }
      continue;
    }
    const done = await db.staffTask.updateMany({ where: { id: t.id, status: { in: OPEN } }, data: { status: "completed", completedAt: new Date() } });
    if (done.count === 1) {
      await writeAuditLog({
        actorType: "system",
        actorId: null,
        action: "task.completed",
        entityType: "StaffTask",
        entityId: t.id,
        before: { status: t.status },
        after: { status: "completed", kind: t.kind, subjectId: t.subjectId },
        reason: "The underlying situation was resolved.",
      });
    }
  }
}

let inFlight: Promise<void> | null = null;
let lastDone = 0;
const MIN_GAP_MS = 3000;

/**
 * Brings the task list up to date with reality. Safe to call from any page:
 * calls that arrive while one is running share it, and a call within a few
 * seconds of the last one is skipped. Pass `force` right after a change you
 * want reflected immediately.
 */
export async function syncTasks(opts: { force?: boolean } = {}): Promise<void> {
  if (inFlight) return inFlight;
  if (!opts.force && Date.now() - lastDone < MIN_GAP_MS) return;
  inFlight = runSync().finally(() => {
    inFlight = null;
    lastDone = Date.now();
  });
  return inFlight;
}

export async function taskCounts() {
  const rows = await db.staffTask.groupBy({ by: ["status"], _count: { _all: true } });
  const n = (s: StaffTaskStatus) => rows.find((r) => r.status === s)?._count._all ?? 0;
  return { pending: n("pending"), inReview: n("in_review"), completed: n("completed") };
}

export async function listTasks(status: StaffTaskStatus) {
  return db.staffTask.findMany({
    where: { status },
    include: { claimedBy: { select: { id: true, name: true } } },
    orderBy: status === "completed" ? { completedAt: "desc" } : { createdAt: "asc" },
    take: status === "completed" ? 200 : 500,
  });
}

/** Anyone who can act on at least one kind of task can pick one up. Read-only roles can look but not take. */
export function canHandleTasks(permissions: string[]): boolean {
  const acting: Permission[] = ["traders.edit", "kyc.decide", "payouts.approve", "risk.review", "support.manage", "countries.manage"];
  return acting.some((p) => hasPermission(permissions, p));
}

/** "Start review": only a pending task can be taken, and only by one person. The loser of a race is told who has it. */
export async function claimTask(input: { taskId: string; adminId: string; ipAddress: string }) {
  const changed = await db.staffTask.updateMany({
    where: { id: input.taskId, status: "pending" },
    data: { status: "in_review", claimedById: input.adminId, claimedAt: new Date() },
  });
  if (changed.count === 0) {
    const t = await db.staffTask.findUnique({ where: { id: input.taskId }, include: { claimedBy: { select: { name: true } } } });
    if (!t) throw new ValidationError("Task not found.", 404);
    if (t.status === "completed") throw new ValidationError("This task is already resolved.", 409);
    throw new ValidationError(`${t.claimedBy?.name ?? "Someone"} is already reviewing this.`, 409);
  }
  const t = await db.staffTask.findUniqueOrThrow({ where: { id: input.taskId } });
  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "task.claimed",
    entityType: "StaffTask",
    entityId: t.id,
    before: { status: "pending" },
    after: { status: "in_review", kind: t.kind, subjectId: t.subjectId },
    ipAddress: input.ipAddress,
  });
  return t;
}

/** "Put back": an in-review task returns to pending so someone else can take it (the person went off shift, took it by mistake). */
export async function releaseTask(input: { taskId: string; adminId: string; ipAddress: string }) {
  const before = await db.staffTask.findUnique({ where: { id: input.taskId } });
  if (!before) throw new ValidationError("Task not found.", 404);
  const changed = await db.staffTask.updateMany({
    where: { id: input.taskId, status: "in_review" },
    data: { status: "pending", claimedById: null, claimedAt: null },
  });
  if (changed.count === 0) {
    throw new ValidationError(before.status === "completed" ? "This task is already resolved." : "This task is not under review.", 409);
  }
  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "task.released",
    entityType: "StaffTask",
    entityId: before.id,
    before: { status: "in_review", claimedById: before.claimedById },
    after: { status: "pending", kind: before.kind, subjectId: before.subjectId },
    ipAddress: input.ipAddress,
  });
}
