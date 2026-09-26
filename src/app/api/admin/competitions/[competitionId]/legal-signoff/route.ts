import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmLegalSignOff } from "@/server/competitions";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({ note: z.string().min(4) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ competitionId: string }> },
) {
  try {
    const admin = await requireAdminPermission("competitions.manage");
    const { competitionId } = await params;
    const { note } = schema.parse(await request.json());

    const updated = await confirmLegalSignOff({
      competitionId,
      note,
      adminId: admin.id,
      ipAddress: await requestIp(),
    });

    return NextResponse.json(updated);
  } catch (err) {
    return errorResponse(err);
  }
}
