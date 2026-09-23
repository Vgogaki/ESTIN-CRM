import { NextResponse } from "next/server";
import { z } from "zod";
import { requestPasswordReset } from "@/server/auth/trader";
import { errorResponse } from "@/server/http";

const schema = z.object({ email: z.string().email() });

export async function POST(request: Request) {
  try {
    const { email } = schema.parse(await request.json());
    await requestPasswordReset(email);
    // Always the same response, whether or not the email exists.
    return NextResponse.json({
      message: "If that email has an account, a reset link has been sent.",
    });
  } catch (err) {
    return errorResponse(err);
  }
}
