import { NextResponse } from "next/server";
import { z } from "zod";
import { setCompetitionStatus } from "@/server/competitions";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({ status: z.enum(["draft", "active", "closed"]) });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ competitionId: string }> },
) {
  try {
    const admin = await requireAdminPermission("competitions.manage");
    const { competitionId } = await params;
    const { status } = schema.parse(await request.json());

    const updated = await setCompetitionStatus({
      competitionId,
      status,
      adminId: admin.id,
      ipAddress: await requestIp(),
    });

    return NextResponse.json(updated);
  } catch (err) {
    return errorResponse(err);
  }
}
