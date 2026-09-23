import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logoutTrader } from "@/server/auth/trader";
import { requestIp, requireTrader } from "@/server/auth/guard";
import { TRADER_SESSION_COOKIE } from "@/server/security/session";
import { errorResponse } from "@/server/http";

export async function POST() {
  try {
    const trader = await requireTrader();
    const cookieStore = await cookies();
    const token = cookieStore.get(TRADER_SESSION_COOKIE)?.value;
    if (token) await logoutTrader(token, trader.id, await requestIp());

    const response = NextResponse.json({ message: "Logged out." });
    response.cookies.delete(TRADER_SESSION_COOKIE);
    return response;
  } catch (err) {
    return errorResponse(err);
  }
}
