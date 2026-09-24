import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Where encrypted KYC document bytes actually live. No object-storage
 * vendor has been chosen yet (EU hosting requirement, CLAUDE.md — that's
 * the technical contractor's call during Foundation Setup, not a guess to
 * make here). Files are encrypted by the app itself before being written,
 * so the storage backend never needs to be trusted for confidentiality —
 * swapping this local filesystem for S3-compatible object storage later
 * only means changing the three functions below; nothing upstream of them
 * changes, and files already encrypted this way don't need re-encrypting.
 *
 * The database (KycDocument, prisma/schema.prisma) stores metadata only —
 * never the bytes — precisely so raw ID scans don't end up in ordinary DB
 * backups or read replicas.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function storageRoot(): string {
  return process.env.KYC_STORAGE_DIR ?? path.join(process.cwd(), ".kyc-storage");
}

function encryptionKey(): Buffer {
  const encoded = process.env.KYC_ENCRYPTION_KEY;
  if (!encoded) {
    throw new Error("KYC_ENCRYPTION_KEY is not set — cannot store or read KYC documents.");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("KYC_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32).");
  }
  return key;
}

export async function storeEncrypted(
  plaintext: Buffer,
): Promise<{ storageKey: string; checksum: string }> {
  const key = encryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const checksum = createHash("sha256").update(plaintext).digest("hex");

  const storageKey = randomBytes(16).toString("hex");
  const root = storageRoot();
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, storageKey), Buffer.concat([iv, authTag, ciphertext]));

  return { storageKey, checksum };
}

export async function retrieveDecrypted(storageKey: string): Promise<Buffer> {
  const key = encryptionKey();
  const raw = await readFile(path.join(storageRoot(), storageKey));

  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export async function deleteStored(storageKey: string): Promise<void> {
  await unlink(path.join(storageRoot(), storageKey)).catch(() => {});
}
