import { getCurrentAdmin } from "@/server/auth/guard";
import { AdminShell } from "@/components/admin-shell";
import { getPendingTasks } from "@/server/pending-tasks";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentAdmin();

  // Not logged in: render bare (the login page itself), no sidebar chrome.
  // The actual auth requirement is still enforced by each protected page.
  if (!admin) return children;

  const tasks = await getPendingTasks();

  return (
    <AdminShell
      admin={{ name: admin.name, roleName: admin.role.name, twoFactorEnabled: admin.twoFactorEnabledAt !== null }}
      pendingTaskCount={tasks.total}
    >
      {children}
    </AdminShell>
  );
}
