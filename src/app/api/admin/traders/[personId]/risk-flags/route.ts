import { NextResponse } from "next/server";
import { z } from "zod";
import { raiseFlag } from "@/server/risk";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({ severity: z.enum(["low", "medium", "high"]), summary: z.string().max(1000) });

export async function POST(request: Request, { params }: { params: Promise<{ personId: string }> }) {
  try {
    const admin = await requireAdminPermission("risk.review");
    const { personId } = await params;
    const body = schema.parse(await request.json());
    const flag = await raiseFlag({ personId, ...body, adminId: admin.id, ipAddress: await requestIp() });
    return NextResponse.json({ id: flag.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
