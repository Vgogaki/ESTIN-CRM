import { NextResponse } from "next/server";
import { z } from "zod";
import { getCandles } from "@/server/trading/terminal";
import { requireTrader } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const query = z.object({ symbol: z.string().min(1).max(20), tf: z.enum(["1m", "5m", "15m", "1h"]).default("5m") });

/** Chart candles for an instrument, built from ESTIN's own stored prices. Any signed-in trader may see prices. */
export async function GET(request: Request) {
  try {
    await requireTrader();
    const q = query.parse(Object.fromEntries(new URL(request.url).searchParams));
    const candles = await getCandles({ symbol: q.symbol, timeframe: q.tf });
    return NextResponse.json({ candles }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
