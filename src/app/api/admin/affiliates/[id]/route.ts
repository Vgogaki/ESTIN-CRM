import { NextResponse } from "next/server";
import { z } from "zod";
import { setAffiliateStatus } from "@/server/affiliates";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminPermission("affiliates.manage");
    const { id } = await params;
    const { status } = z.object({ status: z.enum(["active", "suspended"]) }).parse(await request.json());
    await setAffiliateStatus({ id, status, adminId: admin.id, ipAddress: await requestIp() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
