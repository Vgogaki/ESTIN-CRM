import { NextResponse } from "next/server";
import { z } from "zod";
import { getTerminalState } from "@/server/trading/terminal";
import { requireTrader } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const query = z.object({ accountId: z.string().min(1) });

/** The live terminal for one of the signed-in trader's own accounts. Polled about once a second; never cached. */
export async function GET(request: Request) {
  try {
    const trader = await requireTrader();
    const { accountId } = query.parse(Object.fromEntries(new URL(request.url).searchParams));
    const state = await getTerminalState({ personId: trader.id, accountId });
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
