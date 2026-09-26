import { NextResponse } from "next/server";
import { z } from "zod";
import { createThread } from "@/server/support";
import { readFiles } from "@/server/form-files";
import { requireTrader, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const fields = z.object({
  subject: z.string(),
  category: z.enum(["account", "payout", "kyc", "technical", "other"]),
  body: z.string(),
});

export async function POST(request: Request) {
  try {
    const trader = await requireTrader();
    const form = await request.formData();
    const { subject, category, body } = fields.parse({
      subject: form.get("subject"),
      category: form.get("category") ?? "other",
      body: form.get("body"),
    });
    const thread = await createThread({
      personId: trader.id,
      subject,
      category,
      body,
      files: await readFiles(form, "files"),
      ipAddress: await requestIp(),
    });
    return NextResponse.json({ id: thread.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
