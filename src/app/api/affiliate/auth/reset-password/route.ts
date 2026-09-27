import { NextResponse } from "next/server";
import { z } from "zod";
import { resetAffiliatePassword } from "@/server/auth/affiliate";
import { errorResponse } from "@/server/http";

const schema = z.object({ token: z.string().min(1), newPassword: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const { token, newPassword } = schema.parse(await request.json());
    await resetAffiliatePassword(token, newPassword);
    return NextResponse.json({ message: "Password set. You can now sign in." });
  } catch (err) {
    return errorResponse(err);
  }
}
