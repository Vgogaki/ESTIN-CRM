import { NextResponse } from "next/server";
import { enrollTwoFactor } from "@/server/auth/trader";
import { requireTrader } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

export async function POST() {
  try {
    const trader = await requireTrader();
    const { uri } = await enrollTwoFactor(trader.id);
    return NextResponse.json({ otpauthUri: uri });
  } catch (err) {
    return errorResponse(err);
  }
}
