import { NextResponse } from "next/server";
import { z } from "zod";
import { setCampaignActive } from "@/server/offers";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({ active: z.boolean() });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const admin = await requireAdminPermission("offers.manage");
    const { campaignId } = await params;
    const { active } = schema.parse(await request.json());

    const updated = await setCampaignActive({
      campaignId,
      active,
      adminId: admin.id,
      ipAddress: await requestIp(),
    });

    return NextResponse.json(updated);
  } catch (err) {
    return errorResponse(err);
  }
}
