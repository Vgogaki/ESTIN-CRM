import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logoutAffiliate } from "@/server/auth/affiliate";
import { getCurrentAffiliate, requestIp } from "@/server/auth/guard";
import { AFFILIATE_SESSION_COOKIE } from "@/server/security/session";
import { errorResponse } from "@/server/http";

export async function POST() {
  try {
    const token = (await cookies()).get(AFFILIATE_SESSION_COOKIE)?.value;
    const affiliate = await getCurrentAffiliate();
    if (token && affiliate) await logoutAffiliate(token, affiliate.id, await requestIp());
    const response = NextResponse.json({ ok: true });
    response.cookies.delete(AFFILIATE_SESSION_COOKIE);
    return response;
  } catch (err) {
    return errorResponse(err);
  }
}
