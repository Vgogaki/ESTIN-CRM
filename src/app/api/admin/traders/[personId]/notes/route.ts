import { NextResponse } from "next/server";
import { z } from "zod";
import { addNote } from "@/server/notes";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({ text: z.string().min(1).max(4000) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ personId: string }> },
) {
  try {
    const admin = await requireAdminPermission("notes.create");
    const { personId } = await params;
    const { text } = schema.parse(await request.json());
    const note = await addNote({
      personId,
      authorAdminId: admin.id,
      text,
      ipAddress: await requestIp(),
    });
    return NextResponse.json(note, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
