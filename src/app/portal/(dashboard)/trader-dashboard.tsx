import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Account = {
  id: string;
  challengeTypeName: string;
  accountSize: string;
  currency: string;
  status: "active" | "passed" | "breached" | "closed";
  phase: "evaluation" | "pass_review" | "funded" | "closed";
  phaseLabel: string | null;
  closeReason: string | null;
  daysRemaining: number | null;
};

type Props = {
  trader: { fullName: string; email: string; kycStatus: string; twoFactorEnabled: boolean };
  accounts: Account[];
};

function money(value: string, currency: string) {
  const n = Number(value);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

const STATUS_TONE: Record<Account["status"], "success" | "danger" | "neutral"> = {
  active: "neutral",
  passed: "success",
  breached: "danger",
  closed: "neutral",
};

function AccountCard({ account }: { account: Account }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-sm font-semibold">{account.challengeTypeName}</p>
          <p className="text-xs text-sub">{money(account.accountSize, account.currency)}</p>
        </div>
        <Badge tone={STATUS_TONE[account.status]}>{account.status}</Badge>
      </div>
      <div className="mt-3 flex flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <span className="text-sub">Phase</span>
          <span className="capitalize">{account.phaseLabel ?? account.phase.replace("_", " ")}</span>
        </div>
        {account.status === "active" && account.phase === "evaluation" && account.daysRemaining !== null && (
          <div className="flex justify-between">
            <span className="text-sub">Time remaining</span>
            <span className={account.daysRemaining <= 2 ? "font-medium text-danger" : ""}>
              {account.daysRemaining} day{account.daysRemaining === 1 ? "" : "s"}
            </span>
          </div>
        )}
        {account.closeReason && <p className="mt-1 text-xs text-sub">{account.closeReason}</p>}
      </div>
    </Card>
  );
}

export default function TraderDashboard({ trader, accounts }: Props) {
  return (
    <div>
      <PageHeader title="Your account" />
      <Card className="p-5">
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-sub">Name</dt>
            <dd>{trader.fullName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sub">Email</dt>
            <dd>{trader.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sub">KYC status</dt>
            <dd>
              <Badge
                tone={
                  trader.kycStatus === "verified"
                    ? "success"
                    : trader.kycStatus === "rejected"
                      ? "danger"
                      : "neutral"
                }
              >
                {trader.kycStatus.replace("_", " ")}
              </Badge>
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sub">Two-factor authentication</dt>
            <dd>
              <Badge tone={trader.twoFactorEnabled ? "success" : "neutral"}>
                {trader.twoFactorEnabled ? "Enabled" : "Not enabled"}
              </Badge>
            </dd>
          </div>
        </dl>
        <Link href="/portal/kyc">
          <Button variant="ghost" className="mt-4">
            {trader.kycStatus === "not_started" ? "Upload verification documents" : "Manage KYC documents"}
          </Button>
        </Link>
      </Card>
      <div className="mt-6 flex flex-col gap-3">
        <h2 className="font-display text-sm font-semibold">Your challenges</h2>
        {accounts.length === 0 ? (
          <p className="text-sm text-sub">No challenge accounts yet.</p>
        ) : (
          accounts.map((a) => <AccountCard key={a.id} account={a} />)
        )}
      </div>
    </div>
  );
}
