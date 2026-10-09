import { getCurrentAdmin } from "@/server/auth/guard";
import { AdminShell } from "@/components/admin-shell";
import { getPendingTasks } from "@/server/pending-tasks";
import { listTeam } from "@/server/team";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentAdmin();

  // Not logged in: render bare (the login page itself), no sidebar chrome.
  // The actual auth requirement is still enforced by each protected page.
  if (!admin) return children;

  const [tasks, team] = await Promise.all([getPendingTasks(), listTeam()]);

  return (
    <AdminShell
      admin={{ id: admin.id, name: admin.name, roleName: admin.role.name, twoFactorEnabled: admin.twoFactorEnabledAt !== null }}
      team={team.map((m) => ({ ...m, lastActiveAt: m.lastActiveAt?.toISOString() ?? null }))}
      pendingTaskCount={tasks.total}
    >
      {children}
    </AdminShell>
  );
}
