"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  admin: { name: string; email: string; roleName: string; permissions: string[] };
};

export default function AdminDashboard({ admin }: Props) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function logout() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const res = await fetch("/api/admin/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    setMessage(res.ok ? "Password updated." : (data.error ?? "Failed."));
    if (res.ok) {
      setCurrentPassword("");
      setNewPassword("");
    }
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <h1 className="text-xl font-semibold">Back office</h1>
      <div className="mt-4 rounded border p-4">
        <p>
          <strong>Signed in as:</strong> {admin.name} ({admin.email})
        </p>
        <p>
          <strong>Role:</strong> {admin.roleName}
        </p>
        <p className="mt-2">
          <strong>Permissions:</strong>
        </p>
        <ul className="list-inside list-disc text-sm text-slate-600">
          {admin.permissions.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>

      <form onSubmit={changePassword} className="mt-6 flex flex-col gap-3 rounded border p-4">
        <p className="font-medium">Change password</p>
        <input
          type="password"
          placeholder="Current password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="rounded border px-3 py-2"
        />
        <input
          type="password"
          placeholder="New password (min 10 characters)"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="rounded border px-3 py-2"
        />
        {message && <p className="text-sm">{message}</p>}
        <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-white">
          Update password
        </button>
      </form>

      <button onClick={logout} className="mt-6 text-sm underline">
        Sign out
      </button>
    </main>
  );
}
