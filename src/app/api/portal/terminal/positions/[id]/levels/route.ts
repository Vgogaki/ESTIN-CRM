import { NextResponse } from "next/server";
import { z } from "zod";
import { modifyPositionLevels } from "@/server/trading/trading";
import { requireTrader, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

// A level that is left out stays as it is; null (or an empty string) removes it; a price sets it. Prices
// arrive as text so no precision is lost.
const level = z.union([z.string().max(30), z.number()]).nullable().optional();
const schema = z.object({ accountId: z.string().min(1), stopLoss: level, takeProfit: level });

/** Changes or removes the stop-loss and take-profit of one of the signed-in trader's own open positions. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const trader = await requireTrader();
    const { id } = await params;
    const body = schema.parse(await request.json());
    const position = await modifyPositionLevels({ ...body, positionId: id, personId: trader.id, ipAddress: await requestIp() });
    return NextResponse.json({ id: position.id, stopLoss: position.stopLoss?.toString() ?? null, takeProfit: position.takeProfit?.toString() ?? null });
  } catch (err) {
    return errorResponse(err);
  }
}
