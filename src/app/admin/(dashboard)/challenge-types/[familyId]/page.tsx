import { redirect, notFound } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { getChallengeTypeFamily, diffChallengeTypeVersions, serializeChallengeType } from "@/server/challenge-types";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import FamilyEditor from "./family-editor";

export default async function ChallengeTypeFamilyPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "challengeTypes.view")) {
    return <Alert tone="danger">You don&apos;t have permission to view this.</Alert>;
  }

  const { familyId } = await params;
  const versions = await getChallengeTypeFamily(familyId);
  if (versions.length === 0) notFound();

  const latest = versions[versions.length - 1];
  const canEdit = hasPermission(admin.role.permissions, "challengeTypes.edit");

  return (
    <div>
      <PageHeader
        title={latest.name}
        subtitle={`${versions.length} version${versions.length === 1 ? "" : "s"} · editing v${latest.version}`}
        backHref="/admin/challenge-types"
        backLabel="Challenge types"
      />

      {canEdit ? (
        <FamilyEditor
          latest={{
            id: latest.id,
            active: latest.active,
            name: latest.name,
            description: latest.description,
            productType: latest.productType,
            accountSize: latest.accountSize.toString(),
            fee: latest.fee.toString(),
            currency: latest.currency,
            leverageCap: latest.leverageCap,
            permittedInstruments: latest.permittedInstruments,
            kycTiming: latest.kycTiming,
            phases: latest.phases.map((p) => ({
              order: p.order,
              label: p.label,
              isFunded: p.isFunded,
              profitTargetPct: p.profitTargetPct?.toString() ?? null,
              dailyLossPct: p.dailyLossPct.toString(),
              maxLossPct: p.maxLossPct.toString(),
              drawdownType: p.drawdownType,
              minTradingDays: p.minTradingDays,
              timeLimitDays: p.timeLimitDays,
              profitSplitPct: p.profitSplitPct?.toString() ?? null,
              payoutCycleDays: p.payoutCycleDays,
            })),
          }}
        />
      ) : (
        <p className="text-sm text-sub">
          {latest.active ? `Published — v${latest.version} is live.` : "Not published yet."}
        </p>
      )}

      {versions.length > 1 && (
        <div className="mt-10">
          <h2 className="mb-3 font-display text-sm font-semibold">Version history</h2>
          <div className="flex flex-col gap-3">
            {versions
              .slice()
              .reverse()
              .map((v, i, arr) => {
                const previous = arr[i + 1];
                const changes = previous
                  ? diffChallengeTypeVersions(serializeChallengeType(previous), serializeChallengeType(v))
                  : [];
                return (
                  <Card key={v.id} className="p-4 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">v{v.version}</span>
                      <div className="flex items-center gap-2">
                        {v.active && <Badge tone="success">Live</Badge>}
                        <span className="text-sub">
                          {v.accountCount} account{v.accountCount === 1 ? "" : "s"} pinned
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 text-sub">
                      Created {v.createdAt.toLocaleString()}
                      {v.publishedAt && ` · published ${v.publishedAt.toLocaleString()}`}
                    </p>
                    {previous && changes.length > 0 && (
                      <ul className="mt-2 list-inside list-disc text-sub">
                        {changes.map((c) => (
                          <li key={c.field}>
                            <span className="text-ink">{c.field}</span>: {JSON.stringify(c.before)} →{" "}
                            {JSON.stringify(c.after)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
