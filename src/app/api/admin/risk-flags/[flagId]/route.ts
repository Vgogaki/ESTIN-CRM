import { NextResponse } from "next/server";
import { z } from "zod";
import { changeSeverity, resolveFlag } from "@/server/risk";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("review"), reason: z.string().max(1000) }),
  z.object({ action: z.literal("dismiss"), reason: z.string().max(1000) }),
  z.object({ action: z.literal("severity"), severity: z.enum(["low", "medium", "high"]), reason: z.string().max(1000) }),
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ flagId: string }> }) {
  try {
    const admin = await requireAdminPermission("risk.review");
    const { flagId } = await params;
    const body = schema.parse(await request.json());
    const ctx = { flagId, reason: body.reason, adminId: admin.id, ipAddress: await requestIp() };
    if (body.action === "severity") await changeSeverity({ ...ctx, severity: body.severity });
    else await resolveFlag({ ...ctx, status: body.action === "review" ? "reviewed" : "dismissed" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
