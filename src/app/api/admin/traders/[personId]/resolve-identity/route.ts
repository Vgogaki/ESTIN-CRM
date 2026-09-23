import { NextResponse } from "next/server";
import { resolveIdentityMismatch } from "@/server/traders";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ personId: string }> },
) {
  try {
    const admin = await requireAdminPermission("kyc.decide");
    const { personId } = await params;
    const updated = await resolveIdentityMismatch({
      personId,
      adminId: admin.id,
      ipAddress: await requestIp(),
    });
    return NextResponse.json(updated);
  } catch (err) {
    return errorResponse(err);
  }
}
