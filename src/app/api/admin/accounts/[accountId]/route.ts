import { NextResponse } from "next/server";
import { z } from "zod";
import { updateAccountState } from "@/server/traders";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({
  reason: z.string().min(4),
  status: z.enum(["active", "passed", "breached", "closed"]).optional(),
  phase: z.enum(["evaluation", "pass_review", "funded", "closed"]).optional(),
  equity: z.number().optional(),
  dayStartEquity: z.number().optional(),
  peakEquity: z.number().optional(),
  tradingDays: z.number().int().min(0).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const admin = await requireAdminPermission("traders.edit");
    const { accountId } = await params;
    const { reason, ...patch } = schema.parse(await request.json());
    const updated = await updateAccountState({
      accountId,
      reason,
      patch,
      adminId: admin.id,
      ipAddress: await requestIp(),
    });
    return NextResponse.json(updated);
  } catch (err) {
    return errorResponse(err);
  }
}
