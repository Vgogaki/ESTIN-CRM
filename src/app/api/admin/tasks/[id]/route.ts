import { NextResponse } from "next/server";
import { z } from "zod";
import { canHandleTasks, claimTask, releaseTask } from "@/server/tasks";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { PermissionDeniedError } from "@/server/permissions";
import { errorResponse } from "@/server/http";

const schema = z.object({ action: z.enum(["claim", "release"]) });

/** Start reviewing a task, or put it back. Looking at tasks needs traders.view; taking one needs a role that can act on something. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminPermission("traders.view");
    if (!canHandleTasks(admin.role.permissions)) throw new PermissionDeniedError("traders.edit");
    const { id } = await params;
    const { action } = schema.parse(await request.json());
    const ipAddress = await requestIp();
    if (action === "claim") await claimTask({ taskId: id, adminId: admin.id, ipAddress });
    else await releaseTask({ taskId: id, adminId: admin.id, ipAddress });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
