import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { listOutbox, listTemplates } from "@/server/email/outbox";
import { emailDriver, fromAddress } from "@/server/email/transport";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import EmailView from "./email-view";

export default async function EmailPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "email.manage")) {
    return <Alert tone="danger">You don&apos;t have permission to view this.</Alert>;
  }

  const [templates, outbox] = await Promise.all([listTemplates(), listOutbox()]);
  const driver = emailDriver();

  return (
    <div>
      <PageHeader title="Email" subtitle="The wording of every email the system sends, and a record of what was sent." />
      {driver === "console" ? (
        <Alert tone="warning">
          No email provider is connected yet (a vendor decision), so nothing is actually delivered: messages are
          recorded below and printed in the server log. Once a provider is chosen, connecting it is a settings change
          (EMAIL_DRIVER, SMTP_URL, EMAIL_FROM), not a rebuild.
        </Alert>
      ) : (
        <Alert tone="success">Sending through SMTP as {fromAddress()}.</Alert>
      )}
      <div className="mt-5">
        <EmailView
          adminEmail={admin.email}
          templates={templates.map((t) => ({
            key: t.key,
            label: t.label,
            subject: t.subject,
            body: t.body,
            enabled: t.enabled,
            customised: t.customised,
            variables: [...t.variables],
            marketing: t.marketing,
          }))}
          outbox={outbox.map((o) => ({
            id: o.id,
            toEmail: o.toEmail,
            templateKey: o.templateKey,
            subject: o.subject,
            body: o.body,
            status: o.status,
            attempts: o.attempts,
            lastError: o.lastError,
            createdAt: o.createdAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
