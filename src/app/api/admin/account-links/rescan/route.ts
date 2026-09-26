import { NextResponse } from "next/server";
import { rescanAll } from "@/server/account-links";
import { requireAdminPermission } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

/** Backfill: links are otherwise detected as things happen, so people who registered before this existed need one pass. */
export async function POST() {
  try {
    await requireAdminPermission("risk.review");
    return NextResponse.json({ scanned: await rescanAll() });
  } catch (err) {
    return errorResponse(err);
  }
}
