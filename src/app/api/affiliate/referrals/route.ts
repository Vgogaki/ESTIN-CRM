import { NextResponse } from "next/server";
import { z } from "zod";
import { recordIntroducedPerson } from "@/server/affiliate-referrals";
import { requireAffiliate, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(200),
});

/** The signed-in affiliate records a person they are introducing. Same answer whether or not that email is already a customer. */
export async function POST(request: Request) {
  try {
    const affiliate = await requireAffiliate();
    const body = schema.parse(await request.json());
    await recordIntroducedPerson({ affiliateId: affiliate.id, name: body.name, email: body.email, ipAddress: await requestIp() });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
