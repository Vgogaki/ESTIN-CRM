import { NextResponse } from "next/server";
import { z } from "zod";
import { createOrder } from "@/server/orders";
import { requestIp } from "@/server/auth/guard";
import { checkApiKey } from "@/server/auth/api-key";
import { errorResponse } from "@/server/http";

// spec §8.1 — external wire format, snake_case, not ours to rename.
const schema = z.object({
  order_ref: z.string().min(1),
  full_name: z.string().min(1),
  email: z.string().email(),
  country: z.string().length(2),
  challenge_type_id: z.string().min(1),
  amount_paid: z.number().nonnegative(),
  currency: z.string().length(3),
  payment_provider: z.string().min(1),
  affiliate_code: z.string().nullable().optional(),
  offer_code: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    checkApiKey(request);
    const body = schema.parse(await request.json());

    const { account, replay } = await createOrder({
      orderRef: body.order_ref,
      fullName: body.full_name,
      email: body.email,
      country: body.country,
      challengeTypeId: body.challenge_type_id,
      amountPaid: body.amount_paid,
      currency: body.currency,
      paymentProvider: body.payment_provider,
      affiliateCode: body.affiliate_code,
      offerCode: body.offer_code,
      ipAddress: await requestIp(),
    });

    return NextResponse.json({ account_id: account.id, order_ref: account.orderRef }, {
      status: replay ? 200 : 201,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
