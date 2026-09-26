import { NextResponse } from "next/server";
import { z } from "zod";
import { createCompetition } from "@/server/competitions";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const prizeLadderEntry = z.object({
  rank: z.number().int().positive(),
  type: z.enum(["cash", "funded_account", "free_challenge", "discount"]),
  description: z.string().min(1),
  cashValue: z.number().positive().optional(),
});

const schema = z.object({
  name: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  entryFee: z.number().nonnegative(),
  currency: z.string().length(3),
  entrantCap: z.number().int().positive().nullable().optional(),
  demoAccountSize: z.number().positive(),
  minTradesToQualify: z.number().int().nonnegative(),
  rankingMetric: z.enum(["return_pct", "absolute_pnl"]),
  tieBreakerRule: z.string().min(1),
  prizeLadder: z.array(prizeLadderEntry).min(1),
});

export async function POST(request: Request) {
  try {
    const admin = await requireAdminPermission("competitions.manage");
    const body = schema.parse(await request.json());

    const competition = await createCompetition({
      name: body.name,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      entryFee: body.entryFee,
      currency: body.currency,
      entrantCap: body.entrantCap ?? null,
      demoAccountSize: body.demoAccountSize,
      minTradesToQualify: body.minTradesToQualify,
      rankingMetric: body.rankingMetric,
      tieBreakerRule: body.tieBreakerRule,
      prizeLadder: body.prizeLadder,
      adminId: admin.id,
      ipAddress: await requestIp(),
    });

    return NextResponse.json(competition, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
