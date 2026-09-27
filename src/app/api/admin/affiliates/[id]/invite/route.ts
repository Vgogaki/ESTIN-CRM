import { NextResponse } from "next/server";
import { issueAffiliateInvite } from "@/server/auth/affiliate";
import { requireAdminPermission } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

/** Staff action: (re)send the affiliate's portal invite / password-set link. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminPermission("affiliates.manage");
    const { id } = await params;
    await issueAffiliateInvite(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
