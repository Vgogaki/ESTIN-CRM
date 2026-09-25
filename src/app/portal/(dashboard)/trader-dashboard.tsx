import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Meter } from "@/components/ui/meter";
import PayoutPanel from "./payout-panel";

type Payout = {
  profit: string;
  splitPct: string;
  amount: string;
  canRequest: boolean;
  blockedReason: string | null;
};
type Withdrawal = {
  id: string;
  amount: string;
  status: "pending" | "approved" | "declined" | "paid";
  requestedAt: string;
  decisionNote: string | null;
};
type Rule = {
  pnl: string;
  profitTarget: string | null;
  dailyLossCap: string;
  maxLossCap: string;
  dailyLossUsed: string;
  totalLossUsed: string;
  dailyBreachLevel: string;
  totalBreachLevel: string;
};

type Account = {
  id: string;
  challengeTypeName: string;
  accountSize: string;
  currency: string;
  equity: string;
  status: "active" | "passed" | "breached" | "closed";
  phase: "evaluation" | "pass_review" | "funded" | "closed";
  phaseLabel: string | null;
  closeReason: string | null;
  daysRemaining: number | null;
  drawdownType: string;
  rule: Rule | null;
  payout: Payout | null;
  withdrawals: Withdrawal[];
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
        <div className="flex justify-between">
          <span className="text-sub">Equity</span>
          <span>{money(account.equity, account.currency)}</span>
        </div>
        {account.rule && (
          <div className="flex justify-between">
            <span className="text-sub">P&amp;L since start</span>
            <span className={Number(account.rule.pnl) < 0 ? "text-danger" : "text-success"}>
              {money(account.rule.pnl, account.currency)}
            </span>
          </div>
        )}
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
      {account.rule && (
        <div className="mt-3 border-t border-bd pt-3">
          <p className="mb-2 text-xs font-medium tracking-wide text-sub uppercase">Objectives</p>
          <div className="flex flex-col gap-3">
            {account.rule.profitTarget && (
              <Meter
                label="Profit target"
                used={Math.max(0, Number(account.rule.pnl)).toString()}
                limit={account.rule.profitTarget}
                currency={account.currency}
              />
            )}
            <Meter
              label="Daily loss used"
              used={account.rule.dailyLossUsed}
              limit={account.rule.dailyLossCap}
              currency={account.currency}
            />
            <Meter
              label={`Max loss (${account.drawdownType})`}
              used={account.rule.totalLossUsed}
              limit={account.rule.maxLossCap}
              currency={account.currency}
            />
          </div>
          <p className="mt-2 text-xs text-sub">
            Closes below {money(account.rule.dailyBreachLevel, account.currency)} today, or below{" "}
            {money(account.rule.totalBreachLevel, account.currency)} overall.
          </p>
        </div>
      )}
      {account.payout && (
        <PayoutPanel
          accountId={account.id}
          currency={account.currency}
          payout={account.payout}
          withdrawals={account.withdrawals}
        />
      )}
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
        <div className="mt-4 flex gap-2">
          <Link href="/portal/kyc">
            <Button variant="ghost">
              {trader.kycStatus === "not_started" ? "Upload verification documents" : "Manage KYC documents"}
            </Button>
          </Link>
          <Link href="/portal/security">
            <Button variant="ghost">{trader.twoFactorEnabled ? "Manage security" : "Set up two-factor authentication"}</Button>
          </Link>
        </div>
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
