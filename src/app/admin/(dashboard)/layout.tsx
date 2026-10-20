import { getCurrentAdmin } from "@/server/auth/guard";
import { AdminShell } from "@/components/admin-shell";
import { syncTasks, taskCounts } from "@/server/tasks";
import { listTeam } from "@/server/team";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentAdmin();

  // Not logged in: render bare (the login page itself), no sidebar chrome.
  // The actual auth requirement is still enforced by each protected page.
  if (!admin) return children;

  // The number beside "Tasks" is the tasks nobody has picked up yet: it falls when
  // someone starts a review and when a task is resolved.
  await syncTasks();
  const [counts, team] = await Promise.all([taskCounts(), listTeam()]);

  return (
    <AdminShell
      admin={{ id: admin.id, name: admin.name, roleName: admin.role.name, twoFactorEnabled: admin.twoFactorEnabledAt !== null }}
      team={team.map((m) => ({ ...m, lastActiveAt: m.lastActiveAt?.toISOString() ?? null }))}
      pendingTaskCount={counts.pending}
    >
      {children}
    </AdminShell>
  );
}
