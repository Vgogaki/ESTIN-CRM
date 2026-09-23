import { redirect, notFound } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { getChallengeTypeFamily, diffChallengeTypeVersions, serializeChallengeType } from "@/server/challenge-types";
import FamilyEditor from "./family-editor";

export default async function ChallengeTypeFamilyPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "challengeTypes.view")) {
    return <main className="p-10">You don&apos;t have permission to view this.</main>;
  }

  const { familyId } = await params;
  const versions = await getChallengeTypeFamily(familyId);
  if (versions.length === 0) notFound();

  const latest = versions[versions.length - 1];
  const canEdit = hasPermission(admin.role.permissions, "challengeTypes.edit");

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-xl font-semibold">{latest.name}</h1>
      <p className="mb-6 text-sm text-slate-600">
        {versions.length} version{versions.length === 1 ? "" : "s"} · editing v{latest.version}
      </p>

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
        <p className="text-sm text-slate-600">
          {latest.active ? `Published — v${latest.version} is live.` : "Not published yet."}
        </p>
      )}

      {versions.length > 1 && (
        <div className="mt-10">
          <h2 className="mb-3 font-medium">Version history</h2>
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
                  <div key={v.id} className="rounded border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        v{v.version} {v.active && "(live)"}
                      </span>
                      <span className="text-slate-500">
                        {v.accountCount} account{v.accountCount === 1 ? "" : "s"} pinned to this version
                      </span>
                    </div>
                    <p className="text-slate-500">
                      Created {v.createdAt.toLocaleString()}
                      {v.publishedAt && ` · published ${v.publishedAt.toLocaleString()}`}
                    </p>
                    {previous && changes.length > 0 && (
                      <ul className="mt-2 list-inside list-disc text-slate-600">
                        {changes.map((c) => (
                          <li key={c.field}>
                            {c.field}: {JSON.stringify(c.before)} → {JSON.stringify(c.after)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </main>
  );
}
