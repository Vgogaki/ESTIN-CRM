import { NextResponse } from "next/server";
import { z } from "zod";
import { setKycStatus } from "@/server/traders";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({
  status: z.enum(["not_started", "submitted", "verified", "rejected"]),
  reason: z.string().max(1000).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ personId: string }> },
) {
  try {
    const admin = await requireAdminPermission("kyc.decide");
    const { personId } = await params;
    const body = schema.parse(await request.json());
    const updated = await setKycStatus({
      personId,
      status: body.status,
      reason: body.reason,
      adminId: admin.id,
      ipAddress: await requestIp(),
    });
    return NextResponse.json(updated);
  } catch (err) {
    return errorResponse(err);
  }
}
