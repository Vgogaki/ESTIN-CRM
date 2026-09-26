import { NextResponse } from "next/server";
import { z } from "zod";
import { disqualifyEntry } from "@/server/competitions";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({ reason: z.string().min(4) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ entryId: string }> },
) {
  try {
    const admin = await requireAdminPermission("competitions.manage");
    const { entryId } = await params;
    const { reason } = schema.parse(await request.json());

    const updated = await disqualifyEntry({
      entryId,
      reason,
      adminId: admin.id,
      ipAddress: await requestIp(),
    });

    return NextResponse.json(updated);
  } catch (err) {
    return errorResponse(err);
  }
}
