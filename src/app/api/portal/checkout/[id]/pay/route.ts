import { NextResponse } from "next/server";
import { completeCheckout } from "@/server/checkout";
import { requireTrader, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

/** Pays for the signed-in trader's own checkout. Calling it twice returns the same account. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const trader = await requireTrader();
    const { id } = await params;
    const { account, alreadyDone } = await completeCheckout({ sessionId: id, personId: trader.id, ipAddress: await requestIp() });
    return NextResponse.json({ accountId: account.id }, { status: alreadyDone ? 200 : 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
