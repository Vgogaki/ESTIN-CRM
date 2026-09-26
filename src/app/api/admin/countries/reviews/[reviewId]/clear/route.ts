import { NextResponse } from "next/server";
import { z } from "zod";
import { clearReview } from "@/server/countries";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({ note: z.string().min(4) });

export async function POST(request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  try {
    const admin = await requireAdminPermission("countries.manage");
    const { reviewId } = await params;
    const { note } = schema.parse(await request.json());
    const updated = await clearReview({ reviewId, note, adminId: admin.id, ipAddress: await requestIp() });
    return NextResponse.json(updated);
  } catch (err) {
    return errorResponse(err);
  }
}
