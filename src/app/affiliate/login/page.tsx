import { redirect } from "next/navigation";
import { getCurrentAffiliate } from "@/server/auth/guard";
import AffiliateLoginForm from "./login-form";

export default async function AffiliateLoginPage() {
  const affiliate = await getCurrentAffiliate();
  if (affiliate) redirect("/affiliate");
  return <AffiliateLoginForm />;
}
