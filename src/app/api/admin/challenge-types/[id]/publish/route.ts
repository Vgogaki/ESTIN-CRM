import { NextResponse } from "next/server";
import { publishChallengeType } from "@/server/challenge-types";
import { requireAdminPermission } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminPermission("challengeTypes.edit");
    const { id } = await params;
    const type = await publishChallengeType(id, admin.id);
    return NextResponse.json(type);
  } catch (err) {
    return errorResponse(err);
  }
}
