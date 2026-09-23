import { redirect } from "next/navigation";
import { getCurrentTrader } from "@/server/auth/guard";
import PortalLoginForm from "./login-form";

export default async function PortalLoginPage() {
  const trader = await getCurrentTrader();
  if (trader) redirect("/portal");
  return <PortalLoginForm />;
}
