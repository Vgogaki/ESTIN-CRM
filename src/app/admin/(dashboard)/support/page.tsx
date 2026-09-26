import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { listThreadsForAdmin } from "@/server/support";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";

const FILTERS = [
  { key: "open", label: "Needs reply" },
  { key: "awaiting_trader", label: "Awaiting trader" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
] as const;

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "support.manage")) {
    return <Alert tone="danger">You don&apos;t have permission to view this.</Alert>;
  }
  const { status } = await searchParams;
  const filter = FILTERS.find((f) => f.key === status)?.key ?? "open";
  const threads = await listThreadsForAdmin(filter === "all" ? undefined : filter);

  return (
    <div>
      <PageHeader title="Support" subtitle="Conversations with traders." />
      <div className="mb-4 flex gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/admin/support?status=${f.key}`}
            className={`rounded-md px-3 py-1.5 ${filter === f.key ? "bg-accbg text-acc" : "text-sub hover:text-ink"}`}
          >
            {f.label}
          </Link>
        ))}
      </div>
      {threads.length === 0 ? (
        <Card className="p-6 text-sm text-sub">Nothing here.</Card>
      ) : (
        <div className="flex flex-col gap-2">
          {threads.map((t) => (
            <Link key={t.id} href={`/admin/support/${t.id}`}>
              <Card className="flex items-center justify-between gap-3 p-4 hover:border-acc">
                <div>
                  <p className="text-sm font-medium">{t.subject}</p>
                  <p className="text-xs text-sub">
                    {t.person.fullName} · {t.category} · {new Date(t.lastMessageAt).toLocaleString()}
                  </p>
                </div>
                <Badge tone={t.status === "open" ? "warning" : t.status === "resolved" ? "success" : "accent"}>
                  {t.status.replace("_", " ")}
                </Badge>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
