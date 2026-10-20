import { NextResponse } from "next/server";
import { generateAffiliateCode } from "@/server/affiliate-referrals";
import { requireAffiliate, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

/** The signed-in affiliate asks for their referral code. The system creates it (no input accepted) and logs it. */
export async function POST() {
  try {
    const affiliate = await requireAffiliate();
    const code = await generateAffiliateCode({ affiliateId: affiliate.id, ipAddress: await requestIp() });
    return NextResponse.json({ code: code.code }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
