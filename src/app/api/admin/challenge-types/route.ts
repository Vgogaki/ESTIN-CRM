import { NextResponse } from "next/server";
import { createChallengeType, listChallengeTypeFamilies } from "@/server/challenge-types";
import { challengeTypeSchema } from "@/server/validation/challenge-type";
import { requireAdminPermission } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

export async function GET() {
  try {
    await requireAdminPermission("challengeTypes.view");
    const families = await listChallengeTypeFamilies();
    return NextResponse.json(families);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdminPermission("challengeTypes.edit");
    const body = challengeTypeSchema.parse(await request.json());
    const type = await createChallengeType(body, admin.id);
    return NextResponse.json(type, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
