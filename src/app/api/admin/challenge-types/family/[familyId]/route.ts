import { NextResponse } from "next/server";
import { getChallengeTypeFamily } from "@/server/challenge-types";
import { requireAdminPermission } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ familyId: string }> },
) {
  try {
    await requireAdminPermission("challengeTypes.view");
    const { familyId } = await params;
    const versions = await getChallengeTypeFamily(familyId);
    return NextResponse.json(versions);
  } catch (err) {
    return errorResponse(err);
  }
}
