import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { listCampaigns, getEligibleBreachedTraders, listIssuedOffers } from "@/server/offers";
import { listChallengeTypeFamilies } from "@/server/challenge-types";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import OffersView from "./offers-view";

export default async function OffersPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "offers.manage")) {
    return <Alert tone="danger">You don&apos;t have permission to view this.</Alert>;
  }

  const [campaigns, eligible, issued, families] = await Promise.all([
    listCampaigns(),
    getEligibleBreachedTraders(),
    listIssuedOffers(),
    listChallengeTypeFamilies(),
  ]);

  const activeChallengeTypes = families
    .filter((f) => f.active)
    .map((f) => ({
      id: f.active!.id,
      familyId: f.active!.familyId,
      name: f.active!.name,
      fee: f.active!.fee.toString(),
      currency: f.active!.currency,
    }));

  return (
    <div>
      <PageHeader
        title="Offers"
        subtitle="Discount campaigns and re-purchase offers. A trader who has just breached is your warmest lead."
      />
      <OffersView
        campaigns={campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          code: c.code,
          discountType: c.discountType,
          discountValue: c.discountValue.toString(),
          audience: c.audience,
          challengeTypeFamilyId: c.challengeTypeFamilyId,
          validFrom: c.validFrom.toISOString(),
          validTo: c.validTo.toISOString(),
          maxUses: c.maxUses,
          active: c.active,
          usedCount: c.issuedOffers.filter((o) => o.status !== "withdrawn").length,
        }))}
        eligibleTraders={eligible.map((a) => ({
          personId: a.personId,
          fullName: a.person.fullName,
          email: a.person.email,
          challengeTypeName: a.challengeType.name,
          challengeTypeFamilyId: a.challengeType.familyId,
          breachedAt: a.updatedAt.toISOString(),
        }))}
        issuedOffers={issued.map((o) => ({
          id: o.id,
          traderName: o.person.fullName,
          traderEmail: o.person.email,
          campaignName: o.campaign.name,
          code: o.campaign.code,
          challengeTypeName: o.challengeType.name,
          normalFee: o.normalFee.toString(),
          offerFee: o.offerFee.toString(),
          currency: o.challengeType.currency,
          status: o.status,
          issuedAt: o.issuedAt.toISOString(),
          expiresAt: o.expiresAt.toISOString(),
          withdrawnReason: o.withdrawnReason,
        }))}
        challengeTypes={activeChallengeTypes}
      />
    </div>
  );
}
