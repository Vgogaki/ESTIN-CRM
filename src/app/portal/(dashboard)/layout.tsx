import { getCurrentTrader } from "@/server/auth/guard";
import { PortalShell } from "@/components/portal-shell";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const trader = await getCurrentTrader();

  // Not logged in: render bare (login/register/etc.), no nav chrome. The
  // actual auth requirement is still enforced by each protected page.
  if (!trader) return children;

  return <PortalShell trader={{ fullName: trader.fullName }}>{children}</PortalShell>;
}
