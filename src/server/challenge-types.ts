import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import type { DrawdownType, KycTiming, Prisma, ProductType } from "@prisma/client";

export type PhaseInput = {
  order: number;
  label: string;
  isFunded: boolean;
  profitTargetPct?: number | null;
  dailyLossPct: number;
  maxLossPct: number;
  drawdownType: DrawdownType;
  minTradingDays: number;
  timeLimitDays?: number | null;
  consistencyRule?: Record<string, unknown> | null;
  profitSplitPct?: number | null;
  payoutCycleDays?: number | null;
  minPayoutAmount?: number | null;
};

export type ChallengeTypeInput = {
  name: string;
  description?: string | null;
  productType: ProductType;
  accountSize: number;
  fee: number;
  currency: string;
  leverageCap: number;
  permittedInstruments: string[];
  kycTiming: KycTiming;
  phases: PhaseInput[];
};

const CHALLENGE_TYPE_INCLUDE = { phases: { orderBy: { order: "asc" as const } } };

function phaseCreateData(phases: PhaseInput[]) {
  return phases.map((p) => ({
    order: p.order,
    label: p.label,
    isFunded: p.isFunded,
    profitTargetPct: p.profitTargetPct ?? null,
    dailyLossPct: p.dailyLossPct,
    maxLossPct: p.maxLossPct,
    drawdownType: p.drawdownType,
    minTradingDays: p.minTradingDays,
    timeLimitDays: p.timeLimitDays ?? null,
    consistencyRule: (p.consistencyRule ?? undefined) as Prisma.InputJsonValue | undefined,
    profitSplitPct: p.profitSplitPct ?? null,
    payoutCycleDays: p.payoutCycleDays ?? null,
    minPayoutAmount: p.minPayoutAmount ?? null,
  }));
}

/** A brand-new challenge product. Starts as an unpublished draft (active: false). */
export async function createChallengeType(
  input: ChallengeTypeInput,
  adminId: string,
) {
  const familyId = randomUUID();
  const type = await db.challengeType.create({
    data: {
      familyId,
      version: 1,
      name: input.name,
      description: input.description ?? null,
      productType: input.productType,
      accountSize: input.accountSize,
      fee: input.fee,
      currency: input.currency,
      leverageCap: input.leverageCap,
      permittedInstruments: input.permittedInstruments,
      kycTiming: input.kycTiming,
      active: false,
      createdById: adminId,
      phases: { create: phaseCreateData(input.phases) },
    },
    include: CHALLENGE_TYPE_INCLUDE,
  });

  await writeAuditLog({
    actorType: "admin",
    actorId: adminId,
    action: "challengeType.created",
    entityType: "ChallengeType",
    entityId: type.id,
    after: { name: type.name, familyId: type.familyId, version: type.version },
  });

  return type;
}

/** Makes this version the one new purchases use; deactivates any other version in the same family. */
export async function publishChallengeType(id: string, adminId: string) {
  return db.$transaction(async (tx) => {
    const type = await tx.challengeType.findUniqueOrThrow({ where: { id } });

    await tx.challengeType.updateMany({
      where: { familyId: type.familyId, active: true, id: { not: id } },
      data: { active: false },
    });

    const published = await tx.challengeType.update({
      where: { id },
      data: { active: true, publishedAt: new Date() },
      include: CHALLENGE_TYPE_INCLUDE,
    });

    await writeAuditLog({
      actorType: "admin",
      actorId: adminId,
      action: "challengeType.published",
      entityType: "ChallengeType",
      entityId: id,
      after: { familyId: type.familyId, version: type.version },
    });

    return published;
  });
}

/**
 * Editing a type with zero accounts against it changes it in place. Editing
 * one that has accounts creates version N+1 instead and supersedes the old
 * version — existing accounts keep referencing the old (unchanged) row, so
 * their terms never move under them. See CLAUDE.md "Challenge rules".
 */
export async function updateChallengeType(
  id: string,
  input: ChallengeTypeInput,
  adminId: string,
) {
  const existing = await db.challengeType.findUniqueOrThrow({
    where: { id },
    include: CHALLENGE_TYPE_INCLUDE,
  });
  const accountCount = await db.account.count({ where: { challengeTypeId: id } });

  const scalarData = {
    name: input.name,
    description: input.description ?? null,
    productType: input.productType,
    accountSize: input.accountSize,
    fee: input.fee,
    currency: input.currency,
    leverageCap: input.leverageCap,
    permittedInstruments: input.permittedInstruments,
    kycTiming: input.kycTiming,
  };

  if (accountCount === 0) {
    const updated = await db.$transaction(async (tx) => {
      await tx.challengePhase.deleteMany({ where: { challengeTypeId: id } });
      return tx.challengeType.update({
        where: { id },
        data: { ...scalarData, phases: { create: phaseCreateData(input.phases) } },
        include: CHALLENGE_TYPE_INCLUDE,
      });
    });

    await writeAuditLog({
      actorType: "admin",
      actorId: adminId,
      action: "challengeType.updated",
      entityType: "ChallengeType",
      entityId: id,
      before: serializeChallengeType(existing),
      after: serializeChallengeType(updated),
    });

    return updated;
  }

  // Has live accounts — version instead of mutating.
  const newVersion = await db.$transaction(async (tx) => {
    await tx.challengeType.updateMany({
      where: { familyId: existing.familyId, active: true },
      data: { active: false },
    });

    return tx.challengeType.create({
      data: {
        familyId: existing.familyId,
        version: existing.version + 1,
        ...scalarData,
        active: existing.active, // republish immediately if the old version was live
        publishedAt: existing.active ? new Date() : null,
        createdById: adminId,
        phases: { create: phaseCreateData(input.phases) },
      },
      include: CHALLENGE_TYPE_INCLUDE,
    });
  });

  await writeAuditLog({
    actorType: "admin",
    actorId: adminId,
    action: "challengeType.versioned",
    entityType: "ChallengeType",
    entityId: newVersion.id,
    before: serializeChallengeType(existing),
    after: serializeChallengeType(newVersion),
    reason: `Superseded v${existing.version} (${accountCount} account(s) pinned to it)`,
  });

  return newVersion;
}

export async function listChallengeTypeFamilies() {
  const latestPerFamily = await db.challengeType.findMany({
    orderBy: [{ familyId: "asc" }, { version: "desc" }],
    include: CHALLENGE_TYPE_INCLUDE,
  });

  const byFamily = new Map<string, (typeof latestPerFamily)[number][]>();
  for (const row of latestPerFamily) {
    const list = byFamily.get(row.familyId) ?? [];
    list.push(row);
    byFamily.set(row.familyId, list);
  }

  return Array.from(byFamily.values()).map((versions) => ({
    latest: versions[0],
    versionCount: versions.length,
    active: versions.find((v) => v.active) ?? null,
  }));
}

export async function getChallengeTypeFamily(familyId: string) {
  const versions = await db.challengeType.findMany({
    where: { familyId },
    orderBy: { version: "asc" },
    include: CHALLENGE_TYPE_INCLUDE,
  });
  const accountCounts = await db.account.groupBy({
    by: ["challengeTypeId"],
    where: { challengeTypeId: { in: versions.map((v) => v.id) } },
    _count: true,
  });
  const countByTypeId = new Map(accountCounts.map((c) => [c.challengeTypeId, c._count]));

  return versions.map((v) => ({ ...v, accountCount: countByTypeId.get(v.id) ?? 0 }));
}

function serializeChallengeType(
  type: Prisma.ChallengeTypeGetPayload<{ include: typeof CHALLENGE_TYPE_INCLUDE }>,
) {
  return {
    name: type.name,
    accountSize: type.accountSize.toString(),
    fee: type.fee.toString(),
    currency: type.currency,
    leverageCap: type.leverageCap,
    kycTiming: type.kycTiming,
    phases: type.phases.map((p) => ({
      order: p.order,
      label: p.label,
      profitTargetPct: p.profitTargetPct?.toString() ?? null,
      dailyLossPct: p.dailyLossPct.toString(),
      maxLossPct: p.maxLossPct.toString(),
      drawdownType: p.drawdownType,
      minTradingDays: p.minTradingDays,
    })),
  };
}

/** Field-level diff between two versions of the same family, for the version-history view. */
export function diffChallengeTypeVersions(
  before: ReturnType<typeof serializeChallengeType>,
  after: ReturnType<typeof serializeChallengeType>,
) {
  const changes: { field: string; before: unknown; after: unknown }[] = [];
  for (const key of Object.keys(after) as (keyof typeof after)[]) {
    if (key === "phases") continue;
    if (before[key] !== after[key]) {
      changes.push({ field: key, before: before[key], after: after[key] });
    }
  }
  if (JSON.stringify(before.phases) !== JSON.stringify(after.phases)) {
    changes.push({ field: "phases", before: before.phases, after: after.phases });
  }
  return changes;
}

export { serializeChallengeType };
