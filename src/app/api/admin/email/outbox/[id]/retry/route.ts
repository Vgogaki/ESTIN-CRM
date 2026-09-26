import { NextResponse } from "next/server";
import { retryEmail } from "@/server/email/outbox";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminPermission("email.manage");
    const { id } = await params;
    const result = await retryEmail(id, admin.id, await requestIp());
    return NextResponse.json({ result });
  } catch (err) {
    return errorResponse(err);
  }
}
