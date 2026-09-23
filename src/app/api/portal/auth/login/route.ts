import { NextResponse } from "next/server";
import { z } from "zod";
import { loginTrader } from "@/server/auth/trader";
import { requestIp, requestUserAgent } from "@/server/auth/guard";
import { TRADER_SESSION_COOKIE } from "@/server/security/session";
import { errorResponse } from "@/server/http";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpToken: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const { token, person } = await loginTrader({
      ...body,
      ipAddress: await requestIp(),
      userAgent: await requestUserAgent(),
    });

    const response = NextResponse.json({
      id: person.id,
      fullName: person.fullName,
      email: person.email,
      kycStatus: person.kycStatus,
    });
    response.cookies.set(TRADER_SESSION_COOKIE, token, {
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
