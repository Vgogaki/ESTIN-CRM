import type { KycDocumentType } from "@prisma/client";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { ValidationError } from "@/server/errors";
import { deleteStored, retrieveDecrypted, storeEncrypted } from "@/server/kyc-storage";
import { notifyTrader } from "@/server/notifications";
import { scanPerson } from "@/server/account-links";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export async function uploadKycDocument(input: {
  personId: string;
  type: KycDocumentType;
  file: Buffer;
  originalName: string;
  mimeType: string;
  ipAddress: string;
}) {
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    throw new ValidationError("Only JPEG, PNG, or PDF files are accepted.");
  }
  if (input.file.byteLength === 0) {
    throw new ValidationError("File is empty.");
  }
  if (input.file.byteLength > MAX_SIZE_BYTES) {
    throw new ValidationError("File is too large (10MB max).");
  }

  const { storageKey, checksum } = await storeEncrypted(input.file);

  const doc = await db.kycDocument.create({
    data: {
      personId: input.personId,
      type: input.type,
      storageKey,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: input.file.byteLength,
      checksum,
    },
  });

  // A file reused under a different person is a strong signal (6.1).
  await scanPerson(input.personId);

  // First submission moves not_started -> submitted. Re-uploading after a
  // rejection returns it to submitted for re-review and clears the old
  // rejection reason, since it no longer describes the current submission.
  const person = await db.person.findUniqueOrThrow({ where: { id: input.personId } });
  if (person.kycStatus === "not_started" || person.kycStatus === "rejected") {
    await db.person.update({
      where: { id: input.personId },
      data: { kycStatus: "submitted", kycRejectionReason: null },
    });
    await notifyTrader({
      personId: input.personId,
      type: "kyc_submitted",
      title: "Identity documents submitted",
      body: "Your identity documents have been received and are awaiting review.",
      link: "/portal/kyc",
    });
  }

  await writeAuditLog({
    actorType: "trader",
    actorId: input.personId,
    action: "kyc_document.uploaded",
    entityType: "Person",
    entityId: input.personId,
    after: { type: input.type, originalName: input.originalName, sizeBytes: input.file.byteLength },
    ipAddress: input.ipAddress,
  });

  return doc;
}

export async function listKycDocuments(personId: string) {
  return db.kycDocument.findMany({ where: { personId }, orderBy: { uploadedAt: "desc" } });
}

/**
 * Every fetch of the raw, decrypted bytes is logged — modules-to-design.md
 * §2.5/2.6 requires this explicitly, separately from who decided the KYC
 * outcome. A view is not a decision; it's tracked so that "who has looked
 * at this person's ID" has an answer.
 */
export async function viewKycDocument(input: {
  documentId: string;
  adminId: string;
  ipAddress: string;
}) {
  const doc = await db.kycDocument.findUniqueOrThrow({ where: { id: input.documentId } });
  const plaintext = await retrieveDecrypted(doc.storageKey);

  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "kyc_document.viewed",
    entityType: "KycDocument",
    entityId: doc.id,
    ipAddress: input.ipAddress,
  });

  return { doc, plaintext };
}

/**
 * Hard delete of the encrypted bytes and the metadata row — for a GDPR
 * erasure request, not routine cleanup. What survives is only the audit
 * log entry recording that an erasure happened, which never contains the
 * file itself.
 */
export async function eraseKycDocument(input: {
  documentId: string;
  adminId: string;
  reason: string;
  ipAddress: string;
}) {
  if (input.reason.trim().length < 4) {
    throw new ValidationError("A reason is required to erase a document.");
  }

  const doc = await db.kycDocument.findUniqueOrThrow({ where: { id: input.documentId } });
  await deleteStored(doc.storageKey);
  await db.kycDocument.delete({ where: { id: doc.id } });

  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "kyc_document.erased",
    entityType: "Person",
    entityId: doc.personId,
    before: { type: doc.type, originalName: doc.originalName },
    reason: input.reason,
    ipAddress: input.ipAddress,
  });
}
