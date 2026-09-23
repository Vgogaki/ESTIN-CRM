"use client";

import { useRouter } from "next/navigation";

type Props = {
  trader: { fullName: string; email: string; kycStatus: string; twoFactorEnabled: boolean };
};

export default function TraderDashboard({ trader }: Props) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/portal/auth/logout", { method: "POST" });
    router.push("/portal/login");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <h1 className="text-xl font-semibold">Your account</h1>
      <div className="mt-4 rounded border p-4">
        <p>
          <strong>Name:</strong> {trader.fullName}
        </p>
        <p>
          <strong>Email:</strong> {trader.email}
        </p>
        <p>
          <strong>KYC status:</strong> {trader.kycStatus}
        </p>
        <p>
          <strong>Two-factor authentication:</strong>{" "}
          {trader.twoFactorEnabled ? "Enabled" : "Not enabled"}
        </p>
      </div>
      <p className="mt-4 text-sm text-slate-600">
        No challenge accounts yet — that comes with the commercial flow (Phase 2) and rules
        engine (Phase 3).
      </p>
      <button onClick={logout} className="mt-6 text-sm underline">
        Sign out
      </button>
    </main>
  );
}
