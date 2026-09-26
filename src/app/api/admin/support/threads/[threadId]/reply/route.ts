import { NextResponse } from "next/server";
import { z } from "zod";
import { adminReply } from "@/server/support";
import { readFiles } from "@/server/form-files";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  try {
    const admin = await requireAdminPermission("support.manage");
    const { threadId } = await params;
    const form = await request.formData();
    const body = z.string().parse(form.get("body"));
    const message = await adminReply({
      threadId,
      adminId: admin.id,
      body,
      files: await readFiles(form, "files"),
      resolve: form.get("resolve") === "1",
      ipAddress: await requestIp(),
    });
    return NextResponse.json({ id: message.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
