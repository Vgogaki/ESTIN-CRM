import { NextResponse } from "next/server";
import { deleteRule } from "@/server/countries";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

export async function DELETE(_request: Request, { params }: { params: Promise<{ countryCode: string }> }) {
  try {
    const admin = await requireAdminPermission("countries.manage");
    const { countryCode } = await params;
    await deleteRule({ countryCode, adminId: admin.id, ipAddress: await requestIp() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
