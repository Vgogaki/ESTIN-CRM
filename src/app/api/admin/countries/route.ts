import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertRule } from "@/server/countries";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const action = z.enum(["allowed", "review", "blocked"]);
const schema = z.object({
  countryCode: z.string().length(2),
  registration: action,
  purchase: action,
  trading: action,
  payout: action,
  note: z.string().nullable().optional(),
});

export async function PUT(request: Request) {
  try {
    const admin = await requireAdminPermission("countries.manage");
    const body = schema.parse(await request.json());
    const rule = await upsertRule({ ...body, note: body.note?.trim() || null, adminId: admin.id, ipAddress: await requestIp() });
    return NextResponse.json(rule);
  } catch (err) {
    return errorResponse(err);
  }
}
