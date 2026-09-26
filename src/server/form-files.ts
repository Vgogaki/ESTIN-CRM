import type { UploadedFile } from "@/server/support";

/** Reads every file under a form field, skipping the empty entry browsers send when no file was chosen. */
export async function readFiles(formData: FormData, field: string): Promise<UploadedFile[]> {
  const out: UploadedFile[] = [];
  for (const entry of formData.getAll(field)) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    out.push({ buffer: Buffer.from(await entry.arrayBuffer()), name: entry.name, mimeType: entry.type });
  }
  return out;
}
