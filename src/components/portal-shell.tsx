"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode } from "react";

const NAV = [
  { href: "/portal", label: "Dashboard" },
  { href: "/portal/competitions", label: "Competitions" },
  { href: "/portal/notifications", label: "Notifications" },
];

export function PortalShell({
  trader,
  unreadCount = 0,
  children,
}: {
  trader: { fullName: string };
  unreadCount?: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await fetch("/api/portal/auth/logout", { method: "POST" });
    router.push("/portal/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-bd bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <div className="font-display text-sm font-semibold tracking-[0.14em]">ESTIN</div>
            <nav className="flex gap-1">
              {NAV.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                      active ? "bg-accbg text-acc" : "text-sub hover:text-ink"
                    }`}
                  >
                    {item.label}
                    {item.href === "/portal/notifications" && unreadCount > 0 && (
                      <span className="rounded-full bg-danger-bg px-1.5 py-0.5 font-mono text-[10px] text-danger">
                        {unreadCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-sub">{trader.fullName}</span>
            <button onClick={signOut} className="text-sub underline hover:text-acc">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
