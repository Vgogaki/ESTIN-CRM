import { getCurrentAffiliate } from "@/server/auth/guard";
import { AffiliateShell } from "@/components/affiliate-shell";

export default async function AffiliateLayout({ children }: { children: React.ReactNode }) {
  const affiliate = await getCurrentAffiliate();

  // Not logged in: render bare (login/reset/etc.); each protected page still enforces auth itself.
  if (!affiliate) return children;

  return <AffiliateShell affiliate={{ name: affiliate.name }}>{children}</AffiliateShell>;
}
