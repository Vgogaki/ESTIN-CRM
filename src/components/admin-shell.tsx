"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode } from "react";
import { TeamPanel, type TeamMember } from "@/components/team-panel";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/pending-tasks", label: "Pending tasks" },
  { href: "/admin/traders", label: "Traders" },
  { href: "/admin/withdrawals", label: "Withdrawals" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/email", label: "Email" },
  { href: "/admin/training", label: "Training" },
  { href: "/admin/affiliates", label: "Affiliates" },
  { href: "/admin/finance", label: "Finance" },
  { href: "/admin/offers", label: "Offers" },
  { href: "/admin/competitions", label: "Competitions" },
  { href: "/admin/countries", label: "Countries" },
  { href: "/admin/challenge-types", label: "Challenge types" },
  { href: "/admin/test-tools", label: "Test tools" },
];

export function AdminShell({
  admin,
  team,
  pendingTaskCount = 0,
  children,
}: {
  admin: { id: string; name: string; roleName: string; twoFactorEnabled: boolean };
  team: TeamMember[];
  pendingTaskCount?: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-shrink-0 flex-col gap-1 border-r border-bd bg-surface p-3">
        <div className="mb-3 border-b border-bd px-2 pb-4">
          <div className="font-display text-sm font-semibold tracking-[0.14em]">ESTIN</div>
          <div className="mt-1 text-[11px] tracking-wide text-sub">BACK OFFICE</div>
        </div>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((item) => {
            const active =
              item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-2.5 py-2 text-sm transition-colors ${
                  active
                    ? "bg-accbg font-medium text-acc shadow-[inset_2px_0_0_var(--acc)]"
                    : "text-sub hover:bg-raise hover:text-ink"
                }`}
              >
                <span className="flex items-center justify-between">
                  {item.label}
                  {item.href === "/admin/pending-tasks" && pendingTaskCount > 0 && (
                    <span className="rounded-full bg-danger-bg px-1.5 py-0.5 font-mono text-[10px] text-danger">
                      {pendingTaskCount}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto">
          <TeamPanel initial={team} selfId={admin.id} />
        </div>
        <div className="px-2 text-xs">
          {!admin.twoFactorEnabled && (
            <Link href="/admin/account" className="mb-3 block rounded-md border border-warning-bd bg-warning-bg px-2 py-1.5 text-warning">
              Two-factor is off. Turn it on
            </Link>
          )}
          <Link href="/admin/account" className="block hover:text-acc">
            <div className="text-ink">{admin.name}</div>
            <div className="text-sub">{admin.roleName}</div>
          </Link>
          <button onClick={signOut} className="mt-2 text-sub underline hover:text-acc">
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
