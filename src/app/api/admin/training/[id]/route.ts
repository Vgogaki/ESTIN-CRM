import { NextResponse } from "next/server";
import { z } from "zod";
import { archiveArticle, setPublished, updateArticle } from "@/server/training";
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

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Ctx) {
  try {
    const admin = await requireAdminPermission("content.manage");
    const { id } = await params;
    const body = articleSchema.parse(await request.json());
    await updateArticle({ ...body, id, adminId: admin.id, ipAddress: await requestIp() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const admin = await requireAdminPermission("content.manage");
    const { id } = await params;
    const { published } = z.object({ published: z.boolean() }).parse(await request.json());
    await setPublished({ id, published, adminId: admin.id, ipAddress: await requestIp() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Archives (soft delete with a reason); nothing is ever hard-deleted. */
export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const admin = await requireAdminPermission("content.manage");
    const { id } = await params;
    const { reason } = z.object({ reason: z.string().max(500) }).parse(await request.json());
    await archiveArticle({ id, reason, adminId: admin.id, ipAddress: await requestIp() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
