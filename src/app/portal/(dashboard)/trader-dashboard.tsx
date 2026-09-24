import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Props = {
  trader: { fullName: string; email: string; kycStatus: string; twoFactorEnabled: boolean };
};

export default function TraderDashboard({ trader }: Props) {
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
      <p className="mt-4 text-sm text-sub">
        No challenge accounts yet — that comes with the commercial flow (Phase 2) and rules
        engine (Phase 3).
      </p>
    </div>
  );
}
