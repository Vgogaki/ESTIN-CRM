import { NextResponse } from "next/server";
import { z } from "zod";
import { setThreadStatus } from "@/server/support";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({ event: z.enum(["admin_resolve", "admin_reopen"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  try {
    const admin = await requireAdminPermission("support.manage");
    const { threadId } = await params;
    const { event } = schema.parse(await request.json());
    const updated = await setThreadStatus({ threadId, event, adminId: admin.id, ipAddress: await requestIp() });
    return NextResponse.json(updated);
  } catch (err) {
    return errorResponse(err);
  }
}
