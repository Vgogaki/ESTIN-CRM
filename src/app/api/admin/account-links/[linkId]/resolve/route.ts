import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveLink } from "@/server/account-links";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({ status: z.enum(["dismissed", "confirmed"]), note: z.string().min(4) });

export async function POST(request: Request, { params }: { params: Promise<{ linkId: string }> }) {
  try {
    const admin = await requireAdminPermission("risk.review");
    const { linkId } = await params;
    const { status, note } = schema.parse(await request.json());
    const updated = await resolveLink({ linkId, status, note, adminId: admin.id, ipAddress: await requestIp() });
    return NextResponse.json(updated);
  } catch (err) {
    return errorResponse(err);
  }
}
