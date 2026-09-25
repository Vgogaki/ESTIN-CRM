import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import { getFirmStatistics } from "@/server/firm-stats";
import { getPendingTasks } from "@/server/pending-tasks";
import { listTraders } from "@/server/traders";
import FirmStats from "./firm-stats";

export default async function AdminPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");

  const [stats, tasks, recentTraders] = await Promise.all([
    getFirmStatistics(),
    getPendingTasks(),
    listTraders(),
  ]);

  return (
    <FirmStats
      adminName={admin.name}
      stats={stats}
      tasks={{
        readyToPass: tasks.readyToPass.length,
        flagged: tasks.flagged.length,
        pendingWithdrawals: tasks.pendingWithdrawals.length,
        pendingWithdrawalsTotal: tasks.pendingWithdrawals
          .reduce((sum, w) => sum + Number(w.amount), 0)
          .toString(),
        kycSubmitted: tasks.kycSubmitted.length,
      }}
      recentTraders={recentTraders.slice(0, 6).map((p) => ({
        id: p.id,
        fullName: p.fullName,
        email: p.email,
        kycStatus: p.kycStatus,
        accountCount: p.accounts.length,
      }))}
    />
  );
}
