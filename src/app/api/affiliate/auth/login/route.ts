import { NextResponse } from "next/server";
import { z } from "zod";
import { loginAffiliate } from "@/server/auth/affiliate";
import { requestIp, requestUserAgent } from "@/server/auth/guard";
import { AFFILIATE_SESSION_COOKIE } from "@/server/security/session";
import { errorResponse } from "@/server/http";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const { token, affiliate } = await loginAffiliate({ ...body, ipAddress: await requestIp(), userAgent: await requestUserAgent() });

    const response = NextResponse.json({ id: affiliate.id, name: affiliate.name, email: affiliate.email });
    response.cookies.set(AFFILIATE_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (err) {
    return errorResponse(err);
  }
}
