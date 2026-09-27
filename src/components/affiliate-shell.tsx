"use client";

import { useRouter } from "next/navigation";
import { type ReactNode } from "react";

export function AffiliateShell({ affiliate, children }: { affiliate: { name: string }; children: ReactNode }) {
  const router = useRouter();

  async function signOut() {
    await fetch("/api/affiliate/auth/logout", { method: "POST" });
    router.push("/affiliate/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-bd bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="font-display text-sm font-semibold tracking-[0.14em]">ESTIN</div>
            <span className="text-xs text-sub uppercase tracking-wide">Affiliates</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-sub">{affiliate.name}</span>
            <button onClick={signOut} className="text-sub underline hover:text-acc">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
