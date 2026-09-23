import { NextResponse } from "next/server";
import { z } from "zod";
import { changeAdminPassword } from "@/server/auth/admin";
import { getCurrentAdmin, requestIp } from "@/server/auth/guard";
import { AuthError } from "@/server/auth/errors";
import { errorResponse } from "@/server/http";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10),
});

export async function POST(request: Request) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) throw new AuthError("Not logged in.", 401);
    const body = schema.parse(await request.json());
    await changeAdminPassword({
      adminId: admin.id,
      ...body,
      ipAddress: await requestIp(),
    });
    return NextResponse.json({ message: "Password updated." });
  } catch (err) {
    return errorResponse(err);
  }
}
