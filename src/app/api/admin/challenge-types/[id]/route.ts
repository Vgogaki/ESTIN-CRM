import { NextResponse } from "next/server";
import { updateChallengeType } from "@/server/challenge-types";
import { challengeTypeSchema } from "@/server/validation/challenge-type";
import { requireAdminPermission } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminPermission("challengeTypes.edit");
    const { id } = await params;
    const body = challengeTypeSchema.parse(await request.json());
    const type = await updateChallengeType(id, body, admin.id);
    return NextResponse.json(type);
  } catch (err) {
    return errorResponse(err);
  }
}
