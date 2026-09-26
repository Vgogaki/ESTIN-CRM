import { NextResponse } from "next/server";
import { z } from "zod";
import { approveCommission, markCommissionPaid, voidCommission } from "@/server/affiliates";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), note: z.string().max(1000).nullable().optional() }),
  z.object({ action: z.literal("pay"), reference: z.string().max(200) }),
  z.object({ action: z.literal("void"), reason: z.string().max(1000) }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminPermission("affiliates.manage");
    const { id } = await params;
    const body = schema.parse(await request.json());
    const ctx = { id, adminId: admin.id, ipAddress: await requestIp() };
    if (body.action === "approve") await approveCommission({ ...ctx, note: body.note });
    else if (body.action === "pay") await markCommissionPaid({ ...ctx, reference: body.reference });
    else await voidCommission({ ...ctx, reason: body.reason });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
