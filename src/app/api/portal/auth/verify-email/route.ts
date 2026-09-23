import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyEmail } from "@/server/auth/trader";
import { errorResponse } from "@/server/http";

const schema = z.object({ token: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const { token } = schema.parse(await request.json());
    await verifyEmail(token);
    return NextResponse.json({ message: "Email verified." });
  } catch (err) {
    return errorResponse(err);
  }
}
