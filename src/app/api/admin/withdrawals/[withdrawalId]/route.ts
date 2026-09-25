import { NextResponse } from "next/server";
import { z } from "zod";
import { decideWithdrawal } from "@/server/withdrawals";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({
  decision: z.enum(["approved", "declined"]),
  note: z.string().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ withdrawalId: string }> },
) {
  try {
    const admin = await requireAdminPermission("payouts.approve");
    const { withdrawalId } = await params;
    const { decision, note } = schema.parse(await request.json());

    const updated = await decideWithdrawal({
      withdrawalId,
      adminId: admin.id,
      decision,
      note,
      ipAddress: await requestIp(),
    });

    return NextResponse.json(updated);
  } catch (err) {
    return errorResponse(err);
  }
}
