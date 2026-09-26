import { NextResponse } from "next/server";
import { queueEmail } from "@/server/email/outbox";
import { requireAdminPermission } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

/** Sends the test template to the signed-in staff member's own address, to check delivery end to end. */
export async function POST() {
  try {
    const admin = await requireAdminPermission("email.manage");
    await queueEmail({ templateKey: "system_test", toEmail: admin.email, vars: {} });
    return NextResponse.json({ ok: true, to: admin.email });
  } catch (err) {
    return errorResponse(err);
  }
}
