import { NextResponse } from "next/server";
import { z } from "zod";
import { requestAffiliatePasswordReset } from "@/server/auth/affiliate";
import { errorResponse } from "@/server/http";

const schema = z.object({ email: z.string().email() });

export async function POST(request: Request) {
  try {
    const { email } = schema.parse(await request.json());
    await requestAffiliatePasswordReset(email);
    return NextResponse.json({ message: "If that email has an affiliate account, a link has been sent." });
  } catch (err) {
    return errorResponse(err);
  }
}
