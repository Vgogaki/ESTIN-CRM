import { NextResponse } from "next/server";
import { z } from "zod";
import { updateEntryProgress } from "@/server/competitions";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({
  equity: z.number(),
  tradesCount: z.number().int().nonnegative(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ entryId: string }> },
) {
  try {
    const admin = await requireAdminPermission("competitions.manage");
    const { entryId } = await params;
    const body = schema.parse(await request.json());

    const updated = await updateEntryProgress({
      entryId,
      equity: body.equity,
      tradesCount: body.tradesCount,
      adminId: admin.id,
      ipAddress: await requestIp(),
    });

    return NextResponse.json(updated);
  } catch (err) {
    return errorResponse(err);
  }
}
