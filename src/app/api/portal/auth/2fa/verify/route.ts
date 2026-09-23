import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmTwoFactor } from "@/server/auth/trader";
import { requireTrader } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({ token: z.string().min(6).max(6) });

export async function POST(request: Request) {
  try {
    const trader = await requireTrader();
    const { token } = schema.parse(await request.json());
    await confirmTwoFactor(trader.id, token);
    return NextResponse.json({ message: "Two-factor authentication enabled." });
  } catch (err) {
    return errorResponse(err);
  }
}
