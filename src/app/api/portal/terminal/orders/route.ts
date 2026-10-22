import { NextResponse } from "next/server";
import { z } from "zod";
import { placeMarketOrder } from "@/server/trading/trading";
import { requireTrader, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

// The browser says what to trade and how much. It never says what the price is: the order fills at the
// server's current price. Prices for stop-loss and take-profit arrive as text so no precision is lost.
const schema = z.object({
  accountId: z.string().min(1),
  symbol: z.string().min(1).max(20),
  side: z.enum(["buy", "sell"]),
  lots: z.union([z.string().max(20), z.number()]),
  stopLoss: z.union([z.string().max(30), z.number()]).nullable().optional(),
  takeProfit: z.union([z.string().max(30), z.number()]).nullable().optional(),
});

/** Opens a market order on the signed-in trader's own account. Ownership, permitted instruments, hours, margin and prices are all checked on the server. */
export async function POST(request: Request) {
  try {
    const trader = await requireTrader();
    const body = schema.parse(await request.json());
    const position = await placeMarketOrder({ ...body, personId: trader.id, ipAddress: await requestIp() });
    return NextResponse.json({ id: position.id, symbol: position.symbol, side: position.side, lots: position.lots.toString(), price: position.openPrice.toString() }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
