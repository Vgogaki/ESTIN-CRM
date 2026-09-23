import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";

export async function addNote(input: { personId: string; authorAdminId: string; text: string; ipAddress: string }) {
  const note = await db.note.create({
    data: { personId: input.personId, authorAdminId: input.authorAdminId, text: input.text },
  });

  await writeAuditLog({
    actorType: "admin",
    actorId: input.authorAdminId,
    action: "note.created",
    entityType: "Person",
    entityId: input.personId,
    after: { text: input.text },
    ipAddress: input.ipAddress,
  });

  return note;
}
