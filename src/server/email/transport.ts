import nodemailer, { type Transporter } from "nodemailer";

/**
 * The sending provider is still an open vendor decision (spec 4.5), so delivery
 * is a configuration value rather than code:
 *
 *   EMAIL_DRIVER=console  (default) — prints the email to the server log; nothing is delivered
 *   EMAIL_DRIVER=smtp               — sends through any provider's SMTP relay
 *                                     (SMTP_URL, e.g. smtps://user:pass@host:465)
 *   EMAIL_FROM                      — sender, e.g. "ESTIN <no-reply@yourdomain>"
 *
 * Every mainstream transactional provider offers SMTP, so choosing one later is
 * an environment change, not a rebuild. SMTP credentials live in .env only.
 */
export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
};

export function emailDriver(): "console" | "smtp" {
  return process.env.EMAIL_DRIVER === "smtp" ? "smtp" : "console";
}

export function fromAddress(): string {
  return process.env.EMAIL_FROM || "ESTIN <no-reply@localhost>";
}

export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

let smtp: Transporter | null = null;

export async function sendViaDriver(mail: OutgoingEmail): Promise<{ messageId: string }> {
  if (emailDriver() === "console") {
    console.log(`[email:console] to=${mail.to} subject="${mail.subject}"\n${mail.text}\n`);
    return { messageId: "console" };
  }
  const url = process.env.SMTP_URL;
  if (!url) throw new Error("EMAIL_DRIVER=smtp but SMTP_URL is not set.");
  smtp ??= nodemailer.createTransport(url);
  const info = await smtp.sendMail({ from: fromAddress(), ...mail });
  return { messageId: info.messageId };
}
