import { NextResponse } from "next/server";
import { z } from "zod";
import { resetTemplate, saveTemplate } from "@/server/email/outbox";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({ subject: z.string(), body: z.string(), enabled: z.boolean() });

export async function PUT(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const admin = await requireAdminPermission("email.manage");
    const { key } = await params;
    const input = schema.parse(await request.json());
    await saveTemplate({ key, ...input, adminId: admin.id, ipAddress: await requestIp() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Removes staff's version so the built-in wording applies again. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const admin = await requireAdminPermission("email.manage");
    const { key } = await params;
    await resetTemplate(key, admin.id, await requestIp());
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
