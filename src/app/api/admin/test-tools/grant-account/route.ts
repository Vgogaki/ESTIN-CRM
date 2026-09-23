import { NextResponse } from "next/server";
import { z } from "zod";
import { grantTestAccount } from "@/server/accounts";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({
  personEmail: z.string().email(),
  challengeTypeId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const admin = await requireAdminPermission("challengeTypes.edit");
    const body = schema.parse(await request.json());
    const account = await grantTestAccount({
      ...body,
      adminId: admin.id,
      ipAddress: await requestIp(),
    });
    return NextResponse.json(account, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
