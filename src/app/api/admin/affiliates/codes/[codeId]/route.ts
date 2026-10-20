import { NextResponse } from "next/server";
import { z } from "zod";
import { revokeAffiliateCode } from "@/server/affiliate-referrals";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({ reason: z.string().min(1).max(500) });

/** Staff deactivate a referral code (with a reason). The code stays on record and is never reissued. */
export async function POST(request: Request, { params }: { params: Promise<{ codeId: string }> }) {
  try {
    const admin = await requireAdminPermission("affiliates.manage");
    const { codeId } = await params;
    const { reason } = schema.parse(await request.json());
    await revokeAffiliateCode({ codeId, reason, adminId: admin.id, ipAddress: await requestIp() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
