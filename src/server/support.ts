import type { SupportCategory, SupportStatus } from "@prisma/client";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { notifyTrader } from "@/server/notifications";
import { ValidationError } from "@/server/errors";
import { storeEncrypted, retrieveDecrypted } from "@/server/kyc-storage";

/**
 * Module 4.6 â€” trader-to-staff messaging (modules-to-design.md Â§4.6).
 * Statuses: Open (waiting on staff) / Awaiting trader / Resolved; a
 * trader's reply reopens a resolved thread. Email replies are blocked on
 * the email provider (4.5) â€” the trader is notified in-app instead.
 * "Linked to User 360" (7.3) isn't built; a thread links to the trader's
 * profile page, which already aggregates their accounts, KYC and payouts.
 */
export type SupportEvent = "trader_message" | "admin_reply" | "admin_reply_and_resolve" | "admin_resolve" | "admin_reopen";

/** Pure: the status a thread moves to. Every trader message puts the ball back with staff. */
export function nextStatus(_current: SupportStatus, event: SupportEvent): SupportStatus {
  switch (event) {
    case "trader_message":
    case "admin_reopen":
      return "open";
    case "admin_reply":
      return "awaiting_trader";
    case "admin_reply_and_resolve":
    case "admin_resolve":
      return "resolved";
  }
}

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "application/pdf"]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 3;
const MAX_BODY = 5000;

export type UploadedFile = { buffer: Buffer; name: string; mimeType: string };

function validateMessage(body: string, files: UploadedFile[]) {
  const text = body.trim();
  if (text.length < 1) throw new ValidationError("Write a message first.");
  if (text.length > MAX_BODY) throw new ValidationError(`Messages are limited to ${MAX_BODY} characters.`);
  if (files.length > MAX_FILES) throw new ValidationError(`You can attach up to ${MAX_FILES} files.`);
  for (const f of files) {
    if (!ALLOWED_MIME.has(f.mimeType)) throw new ValidationError("Attachments must be JPEG, PNG or PDF.");
    if (f.buffer.byteLength === 0) throw new ValidationError("An attached file is empty.");
    if (f.buffer.byteLength > MAX_FILE_BYTES) throw new ValidationError("Each attachment must be 10MB or smaller.");
  }
  return text;
}

async function storeAttachments(messageId: string, files: UploadedFile[]) {
  for (const f of files) {
    const { storageKey, checksum } = await storeEncrypted(f.buffer);
    await db.supportAttachment.create({
      data: { messageId, storageKey, originalName: f.name.slice(0, 200), mimeType: f.mimeType, sizeBytes: f.buffer.byteLength, checksum },
    });
  }
}

export async function createThread(input: {
  personId: string;
  subject: string;
  category: SupportCategory;
  body: string;
  files: UploadedFile[];
  ipAddress: string;
}) {
  const subject = input.subject.trim();
  if (subject.length < 3 || subject.length > 120) throw new ValidationError("A subject of 3â€“120 characters is required.");
  const body = validateMessage(input.body, input.files);

  const thread = await db.supportThread.create({
    data: {
      personId: input.personId,
      subject,
      category: input.category,
      messages: { create: { authorType: "trader", body } },
    },
    include: { messages: true },
  });
  await storeAttachments(thread.messages[0].id, input.files);

  await writeAuditLog({
    actorType: "trader",
    actorId: input.personId,
    action: "support.thread_opened",
    entityType: "SupportThread",
    entityId: thread.id,
    after: { category: input.category, attachments: input.files.length },
    ipAddress: input.ipAddress,
  });
  return thread;
}

export async function traderReply(input: {
  threadId: string;
  personId: string;
  body: string;
  files: UploadedFile[];
  ipAddress: string;
}) {
  const thread = await db.supportThread.findUnique({ where: { id: input.threadId } });
  // Same answer for "doesn't exist" and "isn't yours" â€” don't reveal other people's thread ids.
  if (!thread || thread.personId !== input.personId) throw new ValidationError("Conversation not found.", 404);
  const body = validateMessage(input.body, input.files);

  const status = nextStatus(thread.status, "trader_message");
  const message = await db.supportMessage.create({ data: { threadId: thread.id, authorType: "trader", body } });
  await storeAttachments(message.id, input.files);
  await db.supportThread.update({
    where: { id: thread.id },
    data: { status, lastMessageAt: new Date(), resolvedAt: null },
  });

  await writeAuditLog({
    actorType: "trader",
    actorId: input.personId,
    action: thread.status === "resolved" ? "support.thread_reopened" : "support.trader_replied",
    entityType: "SupportThread",
    entityId: thread.id,
    before: { status: thread.status },
    after: { status },
    ipAddress: input.ipAddress,
  });
  return message;
}

export async function adminReply(input: {
  threadId: string;
  adminId: string;
  body: string;
  files: UploadedFile[];
  resolve: boolean;
  ipAddress: string;
}) {
  const thread = await db.supportThread.findUniqueOrThrow({ where: { id: input.threadId } });
  const body = validateMessage(input.body, input.files);

  const status = nextStatus(thread.status, input.resolve ? "admin_reply_and_resolve" : "admin_reply");
  const message = await db.supportMessage.create({
    data: { threadId: thread.id, authorType: "admin", authorAdminId: input.adminId, body },
  });
  await storeAttachments(message.id, input.files);
  await db.supportThread.update({
    where: { id: thread.id },
    data: { status, lastMessageAt: new Date(), resolvedAt: status === "resolved" ? new Date() : null },
  });

  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "support.admin_replied",
    entityType: "SupportThread",
    entityId: thread.id,
    before: { status: thread.status },
    after: { status },
    ipAddress: input.ipAddress,
  });

  await notifyTrader({
    personId: thread.personId,
    type: "support_reply",
    title: "Support replied",
    body: `Re: ${thread.subject}`,
    link: `/portal/support/${thread.id}`,
  });
  return message;
}

export async function setThreadStatus(input: {
  threadId: string;
  event: "admin_resolve" | "admin_reopen";
  adminId: string;
  ipAddress: string;
}) {
  const thread = await db.supportThread.findUniqueOrThrow({ where: { id: input.threadId } });
  const status = nextStatus(thread.status, input.event);
  const updated = await db.supportThread.update({
    where: { id: thread.id },
    data: { status, resolvedAt: status === "resolved" ? new Date() : null },
  });
  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: status === "resolved" ? "support.resolved" : "support.reopened",
    entityType: "SupportThread",
    entityId: thread.id,
    before: { status: thread.status },
    after: { status },
    ipAddress: input.ipAddress,
  });
  return updated;
}

const threadInclude = {
  person: true,
  messages: { orderBy: { createdAt: "asc" as const }, include: { attachments: true, authorAdmin: { select: { name: true } } } },
};

export async function listThreadsForTrader(personId: string) {
  return db.supportThread.findMany({ where: { personId }, orderBy: { lastMessageAt: "desc" } });
}

export async function getThreadForTrader(threadId: string, personId: string) {
  const thread = await db.supportThread.findUnique({ where: { id: threadId }, include: threadInclude });
  return thread && thread.personId === personId ? thread : null;
}

export async function listThreadsForAdmin(status?: SupportStatus) {
  return db.supportThread.findMany({
    where: status ? { status } : {},
    include: { person: true },
    orderBy: { lastMessageAt: "desc" },
  });
}

export async function getThreadForAdmin(threadId: string) {
  return db.supportThread.findUnique({ where: { id: threadId }, include: threadInclude });
}

/** Threads waiting on staff â€” the Pending tasks bucket. */
export async function listAwaitingStaff() {
  return db.supportThread.findMany({
    where: { status: "open" },
    include: { person: true },
    orderBy: { lastMessageAt: "asc" },
  });
}

/** Ownership is enforced here: a trader can only fetch their own; staff pass `asAdmin`. */
export async function getAttachment(attachmentId: string, viewer: { personId: string } | { asAdmin: true }) {
  const att = await db.supportAttachment.findUnique({
    where: { id: attachmentId },
    include: { message: { include: { thread: true } } },
  });
  if (!att) return null;
  if (!("asAdmin" in viewer) && att.message.thread.personId !== viewer.personId) return null;
  return { att, bytes: await retrieveDecrypted(att.storageKey) };
}
