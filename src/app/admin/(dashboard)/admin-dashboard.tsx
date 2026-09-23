"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";

type Props = {
  admin: { name: string; email: string; roleName: string; permissions: string[] };
};

export default function AdminDashboard({ admin }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const res = await fetch("/api/admin/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed.");
      return;
    }
    setMessage("Password updated.");
    setCurrentPassword("");
    setNewPassword("");
  }

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={`Welcome back, ${admin.name}.`} />

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-display text-sm font-semibold">Your account</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-sub">Email</dt>
              <dd>{admin.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sub">Role</dt>
              <dd>
                <Badge tone="accent">{admin.roleName}</Badge>
              </dd>
            </div>
          </dl>
          <h3 className="mt-4 mb-2 text-xs font-medium tracking-wide text-sub uppercase">
            Permissions
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {admin.permissions.map((p) => (
              <Badge key={p} tone="neutral">
                {p}
              </Badge>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 font-display text-sm font-semibold">Change password</h2>
          <form onSubmit={changePassword} className="flex flex-col gap-3">
            <Field label="Current password">
              <Input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </Field>
            <Field label="New password" hint="Minimum 10 characters">
              <Input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>
            {error && <Alert tone="danger">{error}</Alert>}
            {message && <Alert tone="success">{message}</Alert>}
            <Button type="submit" variant="ghost" className="w-fit">
              Update password
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
