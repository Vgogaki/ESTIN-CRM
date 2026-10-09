import { NextResponse } from "next/server";
import { listTeam } from "@/server/team";
import { requireAdmin } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

/** Feeds the sidebar's Team panel. Reading it is not "activity" (touch: false), or an idle open tab would look active forever. */
export async function GET() {
  try {
    await requireAdmin({ touch: false });
    const members = await listTeam();
    return NextResponse.json({
      now: new Date().toISOString(),
      members: members.map((m) => ({ ...m, lastActiveAt: m.lastActiveAt?.toISOString() ?? null })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
