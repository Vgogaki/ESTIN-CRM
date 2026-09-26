import { NextResponse } from "next/server";
import { z } from "zod";
import { createCampaign } from "@/server/offers";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({
  name: z.string().min(1),
  code: z.string().min(2).max(40),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.number().positive(),
  audience: z.enum(["all_traders", "breached_traders", "competition_entrants", "specific_trader"]),
  sendDelayDays: z.number().int().nonnegative(),
  challengeTypeFamilyId: z.string().nullable().optional(),
  validFrom: z.string().min(1),
  validTo: z.string().min(1),
  maxUses: z.number().int().positive().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const admin = await requireAdminPermission("offers.manage");
    const body = schema.parse(await request.json());

    const campaign = await createCampaign({
      name: body.name,
      code: body.code.trim().toUpperCase(),
      discountType: body.discountType,
      discountValue: body.discountValue,
      audience: body.audience,
      challengeTypeFamilyId: body.challengeTypeFamilyId ?? null,
      validFrom: new Date(body.validFrom),
      validTo: new Date(body.validTo),
      maxUses: body.maxUses ?? null,
      sendDelayDays: body.sendDelayDays,
      adminId: admin.id,
      ipAddress: await requestIp(),
    });

    return NextResponse.json(campaign, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
