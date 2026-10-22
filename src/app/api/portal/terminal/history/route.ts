import { NextResponse } from "next/server";
import { z } from "zod";
import { getTradeHistory } from "@/server/trading/terminal";
import { requireTrader } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const query = z.object({ accountId: z.string().min(1) });

/** Closed trades on one of the signed-in trader's own accounts, newest first. */
export async function GET(request: Request) {
  try {
    const trader = await requireTrader();
    const { accountId } = query.parse(Object.fromEntries(new URL(request.url).searchParams));
    const trades = await getTradeHistory({ personId: trader.id, accountId });
    return NextResponse.json({ trades }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
