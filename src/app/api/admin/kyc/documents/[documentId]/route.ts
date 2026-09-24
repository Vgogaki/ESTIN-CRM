import { NextResponse } from "next/server";
import { z } from "zod";
import { viewKycDocument, eraseKycDocument } from "@/server/kyc";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const admin = await requireAdminPermission("kyc.view");
    const { documentId } = await params;
    const { doc, plaintext } = await viewKycDocument({
      documentId,
      adminId: admin.id,
      ipAddress: await requestIp(),
    });

    return new NextResponse(new Uint8Array(plaintext), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `inline; filename="${doc.originalName.replace(/"/g, "")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const eraseSchema = z.object({ reason: z.string().min(4) });

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const admin = await requireAdminPermission("kyc.override");
    const { documentId } = await params;
    const { reason } = eraseSchema.parse(await request.json());
    await eraseKycDocument({
      documentId,
      reason,
      adminId: admin.id,
      ipAddress: await requestIp(),
    });
    return NextResponse.json({ message: "Document erased." });
  } catch (err) {
    return errorResponse(err);
  }
}
