import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { ValidationError } from "@/server/errors";
import { getDefaultTemplate, EMAIL_TEMPLATES } from "./defaults";
import { renderTemplate, textToHtml, unknownVariables, usesVariable } from "./render";
import { appBaseUrl, sendViaDriver } from "./transport";

/** After this many failed attempts a message stays "failed" until staff retry it. */
export const MAX_ATTEMPTS = 5;

/** The sender must not be able to forge someone else's unsubscribe link, so it is signed. */
function unsubscribeToken(personId: string): string {
  return createHmac("sha256", process.env.AUTH_SECRET!).update(`unsubscribe:${personId}`).digest("hex");
}

export function verifyUnsubscribeToken(personId: string, token: string): boolean {
  const expected = Buffer.from(unsubscribeToken(personId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function unsubscribeUrl(personId: string): string {
  return `${appBaseUrl()}/api/unsubscribe?p=${encodeURIComponent(personId)}&t=${unsubscribeToken(personId)}`;
}

/** The template staff have saved, or the built-in default. */
export async function loadTemplate(key: string) {
  const def = getDefaultTemplate(key);
  if (!def) throw new ValidationError(`Unknown email template "${key}".`, 404);
  const saved = await db.emailTemplate.findUnique({ where: { key } });
  return { def, subject: saved?.subject ?? def.subject, body: saved?.body ?? def.body, enabled: saved?.enabled ?? true, customised: !!saved };
}

/**
 * Records an email in the outbox and tries to send it straight away. Never throws
 * into the caller: a broken mail provider must not stop a purchase, a breach or a
 * payout decision. Anything that fails stays in the outbox and is retried.
 */
export async function queueEmail(input: {
  templateKey: string;
  toEmail: string;
  personId?: string;
  vars: Record<string, string>;
}): Promise<void> {
  try {
    const tpl = await loadTemplate(input.templateKey);
    const marketing = tpl.def.marketing;
    const person = input.personId
      ? await db.person.findUnique({ where: { id: input.personId }, select: { marketingConsent: true, voidedAt: true } })
      : null;

    let skipReason: string | null = null;
    if (!tpl.enabled) skipReason = "Template disabled by staff.";
    else if (person?.voidedAt) skipReason = "Person is voided.";
    else if (marketing && !person?.marketingConsent) skipReason = "No marketing consent.";

    let body = renderTemplate(tpl.body, input.vars);
    if (marketing && input.personId) {
      body += `\n\n—\nYou receive this because you opted in to offers. Unsubscribe: ${unsubscribeUrl(input.personId)}`;
    }
    const row = await db.emailOutbox.create({
      data: {
        personId: input.personId,
        toEmail: input.toEmail,
        templateKey: input.templateKey,
        subject: renderTemplate(tpl.subject, input.vars),
        body,
        marketing,
        status: skipReason ? "skipped" : "queued",
        lastError: skipReason,
      },
    });
    if (!skipReason) void sendOutboxRow(row.id).catch((err) => console.error("[email] send failed", err));
  } catch (err) {
    console.error("[email] could not queue", input.templateKey, err);
  }
}

/** Sends one outbox row. The attempt counter doubles as a claim so two workers never send the same message. */
export async function sendOutboxRow(id: string): Promise<"sent" | "failed" | "skipped"> {
  const row = await db.emailOutbox.findUnique({ where: { id } });
  if (!row || (row.status !== "queued" && row.status !== "failed") || row.attempts >= MAX_ATTEMPTS) return "skipped";

  const claim = await db.emailOutbox.updateMany({
    where: { id, attempts: row.attempts, status: { in: ["queued", "failed"] } },
    data: { attempts: { increment: 1 } },
  });
  if (claim.count === 0) return "skipped";

  try {
    const headers: Record<string, string> = {};
    if (row.marketing && row.personId) headers["List-Unsubscribe"] = `<${unsubscribeUrl(row.personId)}>`;
    const { messageId } = await sendViaDriver({ to: row.toEmail, subject: row.subject, text: row.body, html: textToHtml(row.body), headers });
    await db.emailOutbox.update({ where: { id }, data: { status: "sent", sentAt: new Date(), providerMessageId: messageId, lastError: null } });
    return "sent";
  } catch (err) {
    await db.emailOutbox.update({ where: { id }, data: { status: "failed", lastError: err instanceof Error ? err.message : String(err) } });
    return "failed";
  }
}

/** Background job: pick up anything queued or failed that still has attempts left. */
export async function drainOutbox(): Promise<{ sent: number; failed: number }> {
  const rows = await db.emailOutbox.findMany({
    where: { status: { in: ["queued", "failed"] }, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { id: true },
  });
  let sent = 0;
  let failed = 0;
  for (const r of rows) {
    const result = await sendOutboxRow(r.id);
    if (result === "sent") sent++;
    if (result === "failed") failed++;
  }
  return { sent, failed };
}

export async function retryEmail(id: string, adminId: string, ipAddress?: string) {
  const row = await db.emailOutbox.findUnique({ where: { id } });
  if (!row) throw new ValidationError("Email not found.", 404);
  if (row.status !== "failed") throw new ValidationError("Only failed emails can be retried.");
  await db.emailOutbox.update({ where: { id }, data: { attempts: 0, status: "queued" } });
  await writeAuditLog({
    actorType: "admin",
    actorId: adminId,
    action: "email.retried",
    entityType: "EmailOutbox",
    entityId: id,
    ipAddress,
  });
  return sendOutboxRow(id);
}

export async function listTemplates() {
  const saved = new Map((await db.emailTemplate.findMany()).map((t) => [t.key, t]));
  return EMAIL_TEMPLATES.map((def) => {
    const s = saved.get(def.key);
    return { ...def, subject: s?.subject ?? def.subject, body: s?.body ?? def.body, enabled: s?.enabled ?? true, customised: !!s };
  });
}

export async function saveTemplate(input: {
  key: string;
  subject: string;
  body: string;
  enabled: boolean;
  adminId: string;
  ipAddress?: string;
}) {
  const def = getDefaultTemplate(input.key);
  if (!def) throw new ValidationError("Unknown template.", 404);
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject || !body) throw new ValidationError("Subject and message can't be empty.");
  const unknown = [...unknownVariables(subject, def.variables), ...unknownVariables(body, def.variables)];
  if (unknown.length) {
    throw new ValidationError(`Unknown variable(s): ${[...new Set(unknown)].map((v) => `{{${v}}}`).join(", ")}. Allowed: ${def.variables.map((v) => `{{${v}}}`).join(", ") || "none"}.`);
  }
  for (const req of def.required ?? []) {
    if (!usesVariable(body, req)) throw new ValidationError(`This message must include {{${req}}}, otherwise the trader can't complete the step.`);
  }
  const before = await db.emailTemplate.findUnique({ where: { key: input.key } });
  const saved = await db.emailTemplate.upsert({
    where: { key: input.key },
    create: { key: input.key, subject, body, enabled: input.enabled, updatedById: input.adminId },
    update: { subject, body, enabled: input.enabled, updatedById: input.adminId },
  });
  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "email.template_saved",
    entityType: "EmailTemplate",
    entityId: input.key,
    before: before ? { subject: before.subject, body: before.body, enabled: before.enabled } : { default: true },
    after: { subject, body, enabled: input.enabled },
    ipAddress: input.ipAddress,
  });
  return saved;
}

export async function resetTemplate(key: string, adminId: string, ipAddress?: string) {
  const before = await db.emailTemplate.findUnique({ where: { key } });
  if (!before) return;
  await db.emailTemplate.delete({ where: { key } });
  await writeAuditLog({
    actorType: "admin",
    actorId: adminId,
    action: "email.template_reset",
    entityType: "EmailTemplate",
    entityId: key,
    before: { subject: before.subject, body: before.body, enabled: before.enabled },
    ipAddress,
  });
}

export async function listOutbox(limit = 100) {
  return db.emailOutbox.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}

export async function setMarketingConsent(personId: string, consent: boolean, actor: { type: "trader" | "system"; id?: string }, ipAddress?: string) {
  const before = await db.person.findUnique({ where: { id: personId }, select: { marketingConsent: true } });
  if (!before || before.marketingConsent === consent) return;
  await db.person.update({ where: { id: personId }, data: { marketingConsent: consent } });
  await writeAuditLog({
    actorType: actor.type,
    actorId: actor.id ?? personId,
    action: consent ? "person.marketing_opt_in" : "person.marketing_opt_out",
    entityType: "Person",
    entityId: personId,
    before: { marketingConsent: before.marketingConsent },
    after: { marketingConsent: consent },
    ipAddress,
  });
}
