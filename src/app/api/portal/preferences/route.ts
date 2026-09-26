import { NextResponse } from "next/server";
import { z } from "zod";
import { setMarketingConsent } from "@/server/email/outbox";
import { requireTrader, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({ marketingConsent: z.boolean() });

export async function PATCH(request: Request) {
  try {
    const trader = await requireTrader();
    const { marketingConsent } = schema.parse(await request.json());
    await setMarketingConsent(trader.id, marketingConsent, { type: "trader" }, await requestIp());
    return NextResponse.json({ marketingConsent });
  } catch (err) {
    return errorResponse(err);
  }
}
