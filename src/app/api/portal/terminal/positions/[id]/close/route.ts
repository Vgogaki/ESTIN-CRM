import { NextResponse } from "next/server";
import { z } from "zod";
import { closePosition } from "@/server/trading/trading";
import { requireTrader, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({ accountId: z.string().min(1) });

/** Closes one of the signed-in trader's own positions at the current price. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const trader = await requireTrader();
    const { id } = await params;
    const { accountId } = schema.parse(await request.json());
    const closed = await closePosition({ accountId, positionId: id, actor: { type: "trader", personId: trader.id }, ipAddress: await requestIp() });
    return NextResponse.json({ id: closed.positionId, price: closed.closePrice.toString(), netPnl: closed.netPnl.toString() });
  } catch (err) {
    return errorResponse(err);
  }
}
