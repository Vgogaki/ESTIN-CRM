import { NextResponse } from "next/server";
import { z } from "zod";
import { updateInput } from "@/server/jurisdiction";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({
  status: z.enum(["pending", "in_progress", "done"]),
  note: z.string().max(2000).nullable().optional(),
});
const keys = z.enum(["sanctions", "payment_provider", "data_vendor", "marketing_legal"]);

export async function PUT(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const admin = await requireAdminPermission("countries.manage");
    const key = keys.parse((await params).key);
    const body = schema.parse(await request.json());
    const saved = await updateInput({ key, status: body.status, note: body.note?.trim() || null, adminId: admin.id, ipAddress: await requestIp() });
    return NextResponse.json(saved);
  } catch (err) {
    return errorResponse(err);
  }
}
