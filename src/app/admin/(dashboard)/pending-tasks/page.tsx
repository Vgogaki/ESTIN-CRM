import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { getPendingTasks } from "@/server/pending-tasks";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";

function TaskBlock({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone?: "danger" | "success";
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <Card className="mb-3 overflow-hidden p-0">
      <div className="flex items-center gap-2 border-b border-bd px-4 py-3 text-sm font-medium">
        {title}
        <Badge tone={tone ?? "accent"}>{count}</Badge>
      </div>
      <div className="flex flex-col">{children}</div>
    </Card>
  );
}

function TaskRow({
  href,
  title,
  note,
}: {
  href: string;
  title: string;
  note: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between border-b border-bd px-4 py-2.5 text-sm last:border-b-0 hover:bg-raise"
    >
      <span>{title}</span>
      <span className="text-sub">{note}</span>
    </Link>
  );
}

export default async function PendingTasksPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "traders.view")) {
    return <Alert tone="danger">You don&apos;t have permission to view this.</Alert>;
  }

  const tasks = await getPendingTasks();

  return (
    <div>
      <PageHeader
        title="Pending tasks"
        subtitle="Everything waiting on your team, derived automatically from account and KYC state."
      />

      <TaskBlock title="Rule breaches flagged" count={tasks.flagged.length} tone="danger">
        {tasks.flagged.map((a) => (
          <TaskRow
            key={a.id}
            href={`/admin/traders/${a.personId}`}
            title={a.person.fullName}
            note={`${a.challengeType.name} · loss limit exceeded`}
          />
        ))}
      </TaskBlock>

      <TaskBlock title="Ready to pass" count={tasks.readyToPass.length} tone="success">
        {tasks.readyToPass.map((a) => (
          <TaskRow
            key={a.id}
            href={`/admin/traders/${a.personId}`}
            title={a.person.fullName}
            note={`${a.challengeType.name} · target met`}
          />
        ))}
      </TaskBlock>

      <TaskBlock title="Pass review needed" count={tasks.passReview.length}>
        {tasks.passReview.map((a) => (
          <TaskRow
            key={a.id}
            href={`/admin/traders/${a.personId}`}
            title={a.person.fullName}
            note="Awaiting verification"
          />
        ))}
      </TaskBlock>

      <TaskBlock title="KYC submitted — awaiting review" count={tasks.kycSubmitted.length}>
        {tasks.kycSubmitted.map((p) => (
          <TaskRow
            key={p.id}
            href={`/admin/traders/${p.id}`}
            title={p.fullName}
            note="Documents uploaded"
          />
        ))}
      </TaskBlock>

      <TaskBlock title="Funded without verified KYC" count={tasks.fundedWithoutKyc.length} tone="danger">
        {tasks.fundedWithoutKyc.map((a) => (
          <TaskRow
            key={a.id}
            href={`/admin/traders/${a.personId}`}
            title={a.person.fullName}
            note={`KYC: ${a.person.kycStatus}`}
          />
        ))}
      </TaskBlock>

      <TaskBlock
        title="Identity mismatch — name differs from a previous order"
        count={tasks.identityFlags.length}
        tone="danger"
      >
        {tasks.identityFlags.map((p) => (
          <TaskRow key={p.id} href={`/admin/traders/${p.id}`} title={p.email} note={p.fullName} />
        ))}
      </TaskBlock>

      <TaskBlock title="Breached traders awaiting a re-purchase offer" count={tasks.offerLeads.length}>
        {tasks.offerLeads.map((a) => (
          <TaskRow
            key={a.personId}
            href="/admin/offers"
            title={a.person.fullName}
            note="No offer sent"
          />
        ))}
      </TaskBlock>

      <TaskBlock title="Support — awaiting a reply" count={tasks.supportThreads.length}>
        {tasks.supportThreads.map((t) => (
          <TaskRow key={t.id} href={`/admin/support/${t.id}`} title={t.person.fullName} note={t.subject} />
        ))}
      </TaskBlock>

      <TaskBlock title="Possible linked accounts — review" count={tasks.linkedAccounts.length} tone="danger">
        {tasks.linkedAccounts.map((l) => (
          <TaskRow
            key={l.id}
            href={`/admin/traders/${l.personAId}`}
            title={`${l.personA.fullName} ↔ ${l.personB.fullName}`}
            note={(l.signals as { type: string }[]).map((s) => s.type.replace(/_/g, " ")).join(", ")}
          />
        ))}
      </TaskBlock>

      <TaskBlock title="Country review needed" count={tasks.countryReviews.length} tone="danger">
        {tasks.countryReviews.map((r) => (
          <TaskRow
            key={r.id}
            href="/admin/countries"
            title={r.person.fullName}
            note={`${r.countryCode} · ${r.stage}`}
          />
        ))}
      </TaskBlock>

      <TaskBlock title="Payouts pending decision" count={tasks.pendingWithdrawals.length}>
        {tasks.pendingWithdrawals.map((w) => (
          <TaskRow
            key={w.id}
            href="/admin/withdrawals"
            title={w.account.person.fullName}
            note={`${w.amount.toString()} ${w.account.challengeType.currency}`}
          />
        ))}
      </TaskBlock>

      {tasks.total === 0 && (
        <Card className="p-8 text-center text-sm text-sub">
          Nothing pending. Tasks will appear here as traders register, purchase and progress.
        </Card>
      )}
    </div>
  );
}
