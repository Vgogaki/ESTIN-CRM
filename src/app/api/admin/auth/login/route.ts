import { NextResponse } from "next/server";
import { z } from "zod";
import { loginAdmin } from "@/server/auth/admin";
import { requestIp, requestUserAgent } from "@/server/auth/guard";
import { ADMIN_SESSION_COOKIE } from "@/server/security/session";
import { errorResponse } from "@/server/http";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpToken: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const { token, admin } = await loginAdmin({
      ...body,
      ipAddress: await requestIp(),
      userAgent: await requestUserAgent(),
    });

    const response = NextResponse.json({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role.name,
      permissions: admin.role.permissions,
    });
    response.cookies.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return response;
  } catch (err) {
    return errorResponse(err);
  }
}
