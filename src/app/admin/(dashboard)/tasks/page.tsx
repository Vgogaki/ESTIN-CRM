import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { canHandleTasks, KIND_LABEL, listTasks, syncTasks, taskCounts, type TaskKind } from "@/server/tasks";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import TaskActions from "./task-actions";

const TABS = [
  { key: "pending", label: "Pending", hint: "Nobody has picked these up" },
  { key: "in_review", label: "Under review", hint: "Someone is handling these" },
  { key: "completed", label: "Completed", hint: "Resolved: the situation no longer needs attention" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const EMPTY: Record<TabKey, string> = {
  pending: "Nothing waiting. New tasks appear here as traders register, purchase and progress.",
  in_review: "Nothing under review right now. Pick up a pending task with “Start review”.",
  completed: "Nothing completed yet. A task completes by itself once the situation behind it is resolved.",
};

function ago(d: Date): string {
  const mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "traders.view")) {
    return <Alert tone="danger">You don&apos;t have permission to view this.</Alert>;
  }

  const { status } = await searchParams;
  const active: TabKey = TABS.some((t) => t.key === status) ? (status as TabKey) : "pending";

  await syncTasks();
  const [counts, tasks] = await Promise.all([taskCounts(), listTasks(active)]);
  const countFor: Record<TabKey, number> = { pending: counts.pending, in_review: counts.inReview, completed: counts.completed };
  const canHandle = canHandleTasks(admin.role.permissions);

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle="Everything waiting on your team, found automatically from account, KYC and payout state. Start a review to tell the team you have it; a task completes by itself once the situation is resolved."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "pending" ? "/admin/tasks" : `/admin/tasks?status=${t.key}`}
            title={t.hint}
            className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${
              active === t.key ? "border-acc bg-accbg text-acc" : "border-bd text-sub hover:bg-raise hover:text-ink"
            }`}
          >
            {t.label}
            <span className="rounded-full bg-raise px-1.5 py-0.5 font-mono text-[10px] text-ink">{countFor[t.key]}</span>
          </Link>
        ))}
      </div>

      <Card className="overflow-hidden p-0">
        {tasks.length === 0 ? (
          <p className="p-8 text-center text-sm text-sub">{EMPTY[active]}</p>
        ) : (
          tasks.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-4 border-b border-bd px-4 py-3 text-sm last:border-b-0">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={t.href} className="font-medium hover:text-acc">
                    {t.title}
                  </Link>
                  <Badge tone={t.tone === "danger" ? "danger" : t.tone === "success" ? "success" : "accent"}>
                    {KIND_LABEL[t.kind as TaskKind] ?? t.kind}
                  </Badge>
                </div>
                <p className="mt-0.5 text-sub">{t.summary}</p>
                <p className="mt-0.5 text-xs text-sub">
                  {t.status === "pending" && `Waiting ${ago(t.createdAt)}`}
                  {t.status === "in_review" && `Being reviewed by ${t.claimedBy?.name ?? "someone"}${t.claimedAt ? ` since ${ago(t.claimedAt)}` : ""}`}
                  {t.status === "completed" &&
                    `Resolved ${t.completedAt ? ago(t.completedAt) : ""}${t.claimedBy ? ` · reviewed by ${t.claimedBy.name}` : ""}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link href={t.href} className="text-xs text-sub underline hover:text-acc">
                  Open
                </Link>
                {canHandle && t.status !== "completed" && <TaskActions id={t.id} status={t.status} />}
              </div>
            </div>
          ))
        )}
      </Card>
      {active === "completed" && tasks.length === 200 && <p className="mt-2 text-xs text-sub">Showing the 200 most recent.</p>}
    </div>
  );
}
