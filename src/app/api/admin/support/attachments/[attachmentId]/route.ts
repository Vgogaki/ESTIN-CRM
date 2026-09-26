import { getAttachment } from "@/server/support";
import { requireAdminPermission } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

export async function GET(_request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  try {
    await requireAdminPermission("support.manage");
    const { attachmentId } = await params;
    const found = await getAttachment(attachmentId, { asAdmin: true });
    if (!found) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(found.bytes), {
      headers: {
        "Content-Type": found.att.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(found.att.originalName)}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
