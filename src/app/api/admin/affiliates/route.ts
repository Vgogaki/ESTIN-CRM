import { NextResponse } from "next/server";
import { z } from "zod";
import { createAffiliate } from "@/server/affiliates";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({
  name: z.string().max(200),
  email: z.string().email(),
  code: z.string().max(64),
  commissionPct: z.string().max(10),
  linkedTraderEmail: z.string().max(200).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const admin = await requireAdminPermission("affiliates.manage");
    const body = schema.parse(await request.json());
    const affiliate = await createAffiliate({ ...body, adminId: admin.id, ipAddress: await requestIp() });
    return NextResponse.json({ id: affiliate.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
