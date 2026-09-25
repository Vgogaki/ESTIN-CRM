import { NextResponse } from "next/server";
import { z } from "zod";
import { issueOffer } from "@/server/offers";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({
  personId: z.string().min(1),
  campaignId: z.string().min(1),
  challengeTypeId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const admin = await requireAdminPermission("offers.manage");
    const body = schema.parse(await request.json());

    const result = await issueOffer({
      personId: body.personId,
      campaignId: body.campaignId,
      challengeTypeId: body.challengeTypeId,
      adminId: admin.id,
      ipAddress: await requestIp(),
    });

    return NextResponse.json(
      { id: result.issued.id, offerFee: result.issued.offerFee, notified: result.notified },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
