import { NextResponse } from "next/server";
import { z } from "zod";
import { traderReply } from "@/server/support";
import { readFiles } from "@/server/form-files";
import { requireTrader, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  try {
    const trader = await requireTrader();
    const { threadId } = await params;
    const form = await request.formData();
    const body = z.string().parse(form.get("body"));
    const message = await traderReply({
      threadId,
      personId: trader.id,
      body,
      files: await readFiles(form, "files"),
      ipAddress: await requestIp(),
    });
    return NextResponse.json({ id: message.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
