import { NextResponse } from "next/server";
import { z } from "zod";
import { requestWithdrawal } from "@/server/withdrawals";
import { requireTrader, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({ accountId: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const trader = await requireTrader();
    const { accountId } = schema.parse(await request.json());

    const withdrawal = await requestWithdrawal({
      personId: trader.id,
      accountId,
      ipAddress: await requestIp(),
    });

    return NextResponse.json(withdrawal, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
