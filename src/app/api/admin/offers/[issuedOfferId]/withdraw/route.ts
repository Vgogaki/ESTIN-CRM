import { NextResponse } from "next/server";
import { z } from "zod";
import { withdrawOffer } from "@/server/offers";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({ reason: z.string().min(4) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ issuedOfferId: string }> },
) {
  try {
    const admin = await requireAdminPermission("offers.manage");
    const { issuedOfferId } = await params;
    const { reason } = schema.parse(await request.json());

    const updated = await withdrawOffer({
      issuedOfferId,
      reason,
      adminId: admin.id,
      ipAddress: await requestIp(),
    });

    return NextResponse.json(updated);
  } catch (err) {
    return errorResponse(err);
  }
}
