import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { listChallengeTypeFamilies } from "@/server/challenge-types";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";

export default async function ChallengeTypesListPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "challengeTypes.view")) {
    return <Alert tone="danger">You don&apos;t have permission to view this.</Alert>;
  }

  const families = await listChallengeTypeFamilies();

  return (
    <div>
      <PageHeader
        title="Challenge types"
        subtitle="Rule templates traders purchase. Versioned — editing a live one never moves the ground under an existing account."
        actions={
          <Link href="/admin/challenge-types/new">
            <Button>New challenge type</Button>
          </Link>
        }
      />

      {families.length === 0 && (
        <Card className="p-8 text-center text-sm text-sub">No challenge types yet.</Card>
      )}

      <div className="flex flex-col gap-2">
        {families.map(({ latest, versionCount, active }) => (
          <Link key={latest.familyId} href={`/admin/challenge-types/${latest.familyId}`}>
            <Card className="flex items-center justify-between p-4 transition-colors hover:border-acc">
              <div>
                <p className="font-medium">{latest.name}</p>
                <p className="text-sm text-sub">
                  {latest.currency} {latest.accountSize.toString()} · {versionCount} version
                  {versionCount === 1 ? "" : "s"}
                </p>
              </div>
              <Badge tone={active ? "success" : "neutral"}>
                {active ? `Live (v${active.version})` : "No published version"}
              </Badge>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
