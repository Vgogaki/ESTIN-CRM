import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { listTraders } from "@/server/traders";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import type { AccountStatus } from "@prisma/client";

const STATUSES: AccountStatus[] = ["active", "passed", "breached", "closed"];

const STATUS_TONE: Record<AccountStatus, "accent" | "success" | "danger" | "neutral"> = {
  active: "accent",
  passed: "success",
  breached: "danger",
  closed: "neutral",
};

export default async function TradersListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "traders.view")) {
    return <Alert tone="danger">You don&apos;t have permission to view this.</Alert>;
  }

  const { q, status } = await searchParams;
  const statusFilter = STATUSES.includes(status as AccountStatus) ? (status as AccountStatus) : undefined;
  const traders = await listTraders(q, statusFilter);

  function filterUrl(next: { q?: string; status?: string }) {
    const params = new URLSearchParams();
    const nq = next.q ?? q;
    const nstatus = next.status ?? status;
    if (nq) params.set("q", nq);
    if (nstatus) params.set("status", nstatus);
    const qs = params.toString();
    return qs ? `/admin/traders?${qs}` : "/admin/traders";
  }

  return (
    <div>
      <PageHeader title="Traders" subtitle="One row per person. Email identifies the person; KYC belongs to them, not the account." />

      <form className="mb-4 flex flex-wrap items-center gap-2" action="/admin/traders">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search name or email"
          className="w-64 rounded-md border border-bd bg-bg px-3 py-2 text-sm text-ink placeholder:text-sub focus:border-acc focus:outline-none"
        />
        {status && <input type="hidden" name="status" value={status} />}
        <div className="flex gap-1.5">
          <Link
            href={filterUrl({ status: "" })}
            className={`rounded-md border px-3 py-1.5 text-xs ${
              !status ? "border-acc bg-accbg text-acc" : "border-bd text-sub hover:text-ink"
            }`}
          >
            All
          </Link>
          {STATUSES.map((s) => (
            <Link
              key={s}
              href={filterUrl({ status: s })}
              className={`rounded-md border px-3 py-1.5 text-xs capitalize ${
                status === s ? "border-acc bg-accbg text-acc" : "border-bd text-sub hover:text-ink"
              }`}
            >
              {s}
            </Link>
          ))}
        </div>
      </form>

      {traders.length === 0 ? (
        <Card className="p-8 text-center text-sm text-sub">No traders match.</Card>
      ) : (
        <div className="flex flex-col gap-2">
          {traders.map((person) => (
            <Link key={person.id} href={`/admin/traders/${person.id}`}>
              <Card className="flex items-center justify-between p-4 transition-colors hover:border-acc">
                <div>
                  <p className="font-medium">{person.fullName}</p>
                  <p className="text-sm text-sub">
                    {person.email} · {person.country}
                    {person.identityMismatch && (
                      <span className="ml-2">
                        <Badge tone="danger">Identity mismatch</Badge>
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {person.accounts.length === 0 && <span className="text-sm text-sub">No accounts</span>}
                  {person.accounts.map((a) => (
                    <Badge key={a.id} tone={a.voidedAt ? "neutral" : STATUS_TONE[a.status]}>
                      {a.challengeType.name} · {a.voidedAt ? "voided" : a.status}
                    </Badge>
                  ))}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
