import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { listAllWithdrawals } from "@/server/withdrawals";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import WithdrawalsQueue from "./withdrawals-queue";

export default async function WithdrawalsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "payouts.view")) {
    return <Alert tone="danger">You don&apos;t have permission to view this.</Alert>;
  }

  const withdrawals = await listAllWithdrawals();
  const canApprove = hasPermission(admin.role.permissions, "payouts.approve");

  return (
    <div>
      <PageHeader
        title="Withdrawals"
        subtitle="Payout requests, gated on funded phase, verified KYC, and two-factor authentication (enforced server-side)."
      />
      <WithdrawalsQueue
        canApprove={canApprove}
        withdrawals={withdrawals.map((w) => ({
          id: w.id,
          traderName: w.account.person.fullName,
          traderId: w.account.personId,
          country: w.account.person.country,
          kycStatus: w.account.person.kycStatus,
          accountSize: w.account.challengeType.accountSize.toString(),
          currency: w.account.challengeType.currency,
          profit: w.profit.toString(),
          splitPct: w.splitPct.toString(),
          amount: w.amount.toString(),
          status: w.status,
          requestedAt: w.requestedAt.toISOString(),
          decidedByName: w.decidedBy?.name ?? null,
          decidedAt: w.decidedAt?.toISOString() ?? null,
          decisionNote: w.decisionNote,
        }))}
      />
    </div>
  );
}
