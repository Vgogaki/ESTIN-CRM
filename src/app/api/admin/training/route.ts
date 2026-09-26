import { NextResponse } from "next/server";
import { z } from "zod";
import { createArticle } from "@/server/training";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const articleSchema = z.object({
  section: z.enum(["platform_how_to", "challenge_rules", "risk_management", "trading_education"]),
  title: z.string().max(200),
  summary: z.string().max(500).nullable().optional(),
  body: z.string().max(50000),
  videoUrl: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

export async function POST(request: Request) {
  try {
    const admin = await requireAdminPermission("content.manage");
    const body = articleSchema.parse(await request.json());
    const article = await createArticle({ ...body, adminId: admin.id, ipAddress: await requestIp() });
    return NextResponse.json({ id: article.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
