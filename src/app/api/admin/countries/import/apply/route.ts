import { NextResponse } from "next/server";
import { applyCountryImport } from "@/server/countries";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const admin = await requireAdminPermission("countries.manage");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationError("Choose a CSV file first.");
    if (file.size > MAX_FILE_BYTES) throw new ValidationError("That file is too large (max 2MB).");
    const result = await applyCountryImport({ csvText: await file.text(), adminId: admin.id, ipAddress: await requestIp() });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
