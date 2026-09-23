import { NextResponse } from "next/server";
import { z } from "zod";
import { resetPassword } from "@/server/auth/trader";
import { errorResponse } from "@/server/http";

const schema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(10),
});

export async function POST(request: Request) {
  try {
    const { token, newPassword } = schema.parse(await request.json());
    await resetPassword(token, newPassword);
    return NextResponse.json({ message: "Password updated. You can now log in." });
  } catch (err) {
    return errorResponse(err);
  }
}
