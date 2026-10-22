import { NextResponse } from "next/server";
import { z } from "zod";
import { startCheckout } from "@/server/checkout";
import { requireTrader, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

// The browser says WHICH challenge and that terms were accepted. It never says what it costs:
// the price is worked out on the server.
const schema = z.object({
  challengeTypeId: z.string().min(1),
  acceptTerms: z.boolean(),
  referralCode: z.string().max(64).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const trader = await requireTrader();
    const body = schema.parse(await request.json());
    const session = await startCheckout({ personId: trader.id, ...body, ipAddress: await requestIp() });
    return NextResponse.json({ id: session.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
