import { NextResponse } from "next/server";
import { z } from "zod";
import { forceClosePosition } from "@/server/trading/admin-view";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({ accountId: z.string().min(1), reason: z.string().max(1000) });

/** Staff force-close of one open position of this trader, at the current price. Needs trading.forceClose and a written reason. */
export async function POST(request: Request, { params }: { params: Promise<{ personId: string; id: string }> }) {
  try {
    const admin = await requireAdminPermission("trading.forceClose");
    const { personId, id } = await params;
    const body = schema.parse(await request.json());
    const closed = await forceClosePosition({ personId, accountId: body.accountId, positionId: id, adminId: admin.id, reason: body.reason, ipAddress: await requestIp() });
    return NextResponse.json({ id: closed.positionId, price: closed.closePrice.toString(), netPnl: closed.netPnl.toString() });
  } catch (err) {
    return errorResponse(err);
  }
}
