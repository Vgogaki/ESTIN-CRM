import { NextResponse } from "next/server";
import type { KycDocumentType } from "@prisma/client";
import { uploadKycDocument } from "@/server/kyc";
import { requireTrader, requestIp } from "@/server/auth/guard";
import { ValidationError } from "@/server/errors";
import { errorResponse } from "@/server/http";

const DOC_TYPES = new Set(["identity_front", "identity_back", "proof_of_address", "selfie"]);

export async function POST(request: Request) {
  try {
    const trader = await requireTrader();
    const formData = await request.formData();

    const type = formData.get("type");
    const file = formData.get("file");

    if (typeof type !== "string" || !DOC_TYPES.has(type)) {
      throw new ValidationError("Invalid document type.");
    }
    if (!(file instanceof File)) {
      throw new ValidationError("No file provided.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const doc = await uploadKycDocument({
      personId: trader.id,
      type: type as KycDocumentType,
      file: buffer,
      originalName: file.name,
      mimeType: file.type,
      ipAddress: await requestIp(),
    });

    return NextResponse.json(
      { id: doc.id, type: doc.type, uploadedAt: doc.uploadedAt },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
