import { NextResponse } from "next/server";
import { z } from "zod";
import { advanceAccount } from "@/server/traders";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({ resetEquity: z.boolean(), note: z.string().optional() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const admin = await requireAdminPermission("traders.edit");
    const { accountId } = await params;
    const { resetEquity, note } = schema.parse(await request.json());
    const updated = await advanceAccount({
      accountId,
      resetEquity,
      note,
      adminId: admin.id,
      ipAddress: await requestIp(),
    });
    return NextResponse.json(updated);
  } catch (err) {
    return errorResponse(err);
  }
}
