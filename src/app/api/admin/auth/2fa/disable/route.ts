import { NextResponse } from "next/server";
import { z } from "zod";
import { disableTwoFactor } from "@/server/auth/admin-2fa";
import { requireAdmin, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({ password: z.string().max(200), token: z.string().max(20) });

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const { password, token } = schema.parse(await request.json());
    await disableTwoFactor({ adminId: admin.id, password, token, ipAddress: await requestIp() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
