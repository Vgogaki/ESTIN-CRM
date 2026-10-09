import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmEnrollment } from "@/server/auth/admin-2fa";
import { requireAdmin, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({ token: z.string().max(20) });

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const { token } = schema.parse(await request.json());
    const recoveryCodes = await confirmEnrollment(admin.id, token, await requestIp());
    return NextResponse.json({ recoveryCodes });
  } catch (err) {
    return errorResponse(err);
  }
}
