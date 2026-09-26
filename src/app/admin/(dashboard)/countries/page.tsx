import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { listRules, listOpenReviews } from "@/server/countries";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import CountriesView from "./countries-view";

export default async function CountriesPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "countries.manage")) {
    return <Alert tone="danger">You don&apos;t have permission to view this.</Alert>;
  }

  const [rules, reviews] = await Promise.all([listRules(), listOpenReviews()]);

  return (
    <div>
      <PageHeader
        title="Restricted countries"
        subtitle="Per country: allowed, review, or blocked — separately for registration, purchase, trading and payout."
      />
      <Alert tone="warning">
        This list starts empty on purpose. Which countries belong on it is a legal and business decision
        (decisions.md #11), not a development one — nothing here is a default copied from elsewhere. A country
        with no row is allowed everywhere. Today the country checked is the one the trader declared at
        registration or on the order (also their billing country). IP geolocation is not built, and trading
        rules are stored but can&apos;t be enforced until there is a trading platform.
      </Alert>
      <div className="mt-5">
        <CountriesView
          rules={rules.map((r) => ({
            countryCode: r.countryCode,
            registration: r.registration,
            purchase: r.purchase,
            trading: r.trading,
            payout: r.payout,
            note: r.note,
          }))}
          reviews={reviews.map((r) => ({
            id: r.id,
            personId: r.personId,
            fullName: r.person.fullName,
            countryCode: r.countryCode,
            stage: r.stage,
            createdAt: r.createdAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
