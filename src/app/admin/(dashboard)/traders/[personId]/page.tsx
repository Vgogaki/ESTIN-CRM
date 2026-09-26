import { redirect, notFound } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { getTraderDetail } from "@/server/traders";
import { evaluateAccount } from "@/server/rules";
import { daysRemaining } from "@/server/expiry";
import { planAdvance } from "@/server/phase-advance";
import { linksForPerson } from "@/server/account-links";
import { devicesForPerson } from "@/server/devices";
import { riskProfile } from "@/server/risk";
import RiskCard from "./risk-card";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { getPersonActivity } from "@/server/person-activity";
import TraderDetail from "./trader-detail";
import PersonActivity from "./person-activity";

export default async function TraderDetailPage({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "traders.view")) {
    return <Alert tone="danger">You don&apos;t have permission to view this.</Alert>;
  }

  const { personId } = await params;
  const person = await getTraderDetail(personId);
  if (!person) notFound();

  const links = await linksForPerson(person.id);
  const risk = await riskProfile(person.id);
  const devices = hasPermission(admin.role.permissions, "risk.review") ? await devicesForPerson(person.id) : null;
  const activity = await getPersonActivity(person.id, {
    audit: hasPermission(admin.role.permissions, "auditLog.view"),
    support: hasPermission(admin.role.permissions, "support.manage"),
  });

  const accounts = person.accounts.map((a) => {
    const evalR = a.currentPhase
      ? evaluateAccount({
          accountSize: a.challengeType.accountSize,
          equity: a.equity,
          dayStartEquity: a.dayStartEquity,
          peakEquity: a.peakEquity,
          tradingDays: a.tradingDays,
          profitTargetPct: a.currentPhase.profitTargetPct,
          dailyLossPct: a.currentPhase.dailyLossPct,
          maxLossPct: a.currentPhase.maxLossPct,
          drawdownType: a.currentPhase.drawdownType,
          minTradingDays: a.currentPhase.minTradingDays,
        })
      : null;

    const plan =
      a.phase === "pass_review"
        ? planAdvance({
            accountPhase: a.phase,
            accountStatus: a.status,
            voided: a.voidedAt !== null,
            currentPhaseId: a.currentPhaseId,
            phases: a.challengeType.phases,
            kycStatus: person.kycStatus,
            kycTiming: a.challengeType.kycTiming,
          })
        : null;

    return {
      id: a.id,
      orderRef: a.orderRef,
      status: a.status,
      phase: a.phase,
      equity: a.equity.toString(),
      balance: a.balance.toString(),
      dayStartEquity: a.dayStartEquity.toString(),
      peakEquity: a.peakEquity.toString(),
      tradingDays: a.tradingDays,
      startedAt: a.startedAt.toISOString(),
      voidedAt: a.voidedAt?.toISOString() ?? null,
      voidReason: a.voidReason,
      challengeTypeName: a.challengeType.name,
      accountSize: a.challengeType.accountSize.toString(),
      currency: a.challengeType.currency,
      minTradingDays: a.currentPhase?.minTradingDays ?? 0,
      drawdownType: a.currentPhase?.drawdownType ?? "trailing",
      equityTickCount: a.equityTicks.length,
      advance: plan?.ok ? { label: plan.target.label, isFunded: plan.target.isFunded } : null,
      advanceBlockedReason: plan && !plan.ok ? plan.reason : null,
      timeLimitDays: a.currentPhase?.timeLimitDays ?? null,
      daysRemaining: a.currentPhase
        ? daysRemaining({
            timeLimitDays: a.currentPhase.timeLimitDays,
            phaseStartedAt: a.phaseStartedAt,
            now: new Date(),
          })
        : null,
      rule: evalR
        ? {
            pnl: evalR.pnl.toString(),
            profitTarget: evalR.profitTarget?.toString() ?? null,
            dailyLossCap: evalR.dailyLossCap.toString(),
            maxLossCap: evalR.maxLossCap.toString(),
            dailyLossUsed: evalR.dailyLossUsed.toString(),
            totalLossUsed: evalR.totalLossUsed.toString(),
            dailyBreachLevel: evalR.dailyBreachLevel.toString(),
            totalBreachLevel: evalR.totalBreachLevel.toString(),
            breachedDaily: evalR.breachedDaily,
            breachedTotal: evalR.breachedTotal,
            hitTarget: evalR.hitTarget,
          }
        : null,
    };
  });

  return (
    <div>
      <PageHeader title={person.fullName} subtitle={person.email} backHref="/admin/traders" backLabel="Traders" />
      <TraderDetail
        permissions={admin.role.permissions}
        person={{
          id: person.id,
          fullName: person.fullName,
          email: person.email,
          country: person.country,
          kycStatus: person.kycStatus,
          identityMismatch: person.identityMismatch,
          kycRejectionReason: person.kycRejectionReason,
        }}
        accounts={accounts}
        links={links}
        notes={person.notes.map((n) => ({
          id: n.id,
          text: n.text,
          createdAt: n.createdAt.toISOString(),
          authorName: n.authorAdmin.name,
        }))}
        payments={person.payments.map((p) => ({
          id: p.id,
          orderRef: p.orderRef,
          amountPaid: p.amountPaid.toString(),
          currency: p.currency,
          status: p.status,
          createdAt: p.createdAt.toISOString(),
        }))}
        kycDocuments={person.kycDocuments.map((d) => ({
          id: d.id,
          type: d.type,
          originalName: d.originalName,
          sizeBytes: d.sizeBytes,
          uploadedAt: d.uploadedAt.toISOString(),
        }))}
        withdrawals={person.accounts.flatMap((a) =>
          a.withdrawals.map((w) => ({
            id: w.id,
            challengeTypeName: a.challengeType.name,
            amount: w.amount.toString(),
            currency: a.challengeType.currency,
            status: w.status,
            requestedAt: w.requestedAt.toISOString(),
            decisionNote: w.decisionNote,
          })),
        )}
      />
      <RiskCard
        personId={person.id}
        canReview={hasPermission(admin.role.permissions, "risk.review")}
        profile={{
          level: risk.level,
          blocksPayout: risk.blocksPayout,
          signals: risk.signals,
          flags: risk.flags.map((f) => ({
            id: f.id,
            type: f.type,
            source: f.source,
            severity: f.severity,
            status: f.status,
            summary: f.summary,
            createdAt: f.createdAt.toISOString(),
            reviewReason: f.reviewReason,
          })),
        }}
      />
      <PersonActivity activity={activity} devices={devices} />
    </div>
  );
}
