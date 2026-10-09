import { NextResponse } from "next/server";
import { startEnrollment } from "@/server/auth/admin-2fa";
import { requireAdmin, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

export async function POST() {
  try {
    const admin = await requireAdmin();
    return NextResponse.json(await startEnrollment(admin.id, await requestIp()));
  } catch (err) {
    return errorResponse(err);
  }
}
