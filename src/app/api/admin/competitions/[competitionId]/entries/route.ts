import { NextResponse } from "next/server";
import { z } from "zod";
import { enterCompetition } from "@/server/competitions";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({
  personId: z.string().min(1),
  entryPaidAmount: z.number().nonnegative(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ competitionId: string }> },
) {
  try {
    const admin = await requireAdminPermission("competitions.manage");
    const { competitionId } = await params;
    const body = schema.parse(await request.json());

    const entry = await enterCompetition({
      competitionId,
      personId: body.personId,
      entryPaidAmount: body.entryPaidAmount,
      adminId: admin.id,
      ipAddress: await requestIp(),
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
