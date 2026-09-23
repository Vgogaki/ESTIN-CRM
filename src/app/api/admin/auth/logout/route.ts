import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logoutAdmin } from "@/server/auth/admin";
import { getCurrentAdmin, requestIp } from "@/server/auth/guard";
import { ADMIN_SESSION_COOKIE } from "@/server/security/session";
import { AuthError } from "@/server/auth/errors";
import { errorResponse } from "@/server/http";

export async function POST() {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) throw new AuthError("Not logged in.", 401);
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
    if (token) await logoutAdmin(token, admin.id, await requestIp());

    const response = NextResponse.json({ message: "Logged out." });
    response.cookies.delete(ADMIN_SESSION_COOKIE);
    return response;
  } catch (err) {
    return errorResponse(err);
  }
}
