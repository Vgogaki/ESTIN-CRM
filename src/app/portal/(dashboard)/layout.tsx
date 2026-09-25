import { getCurrentTrader } from "@/server/auth/guard";
import { PortalShell } from "@/components/portal-shell";
import { unreadNotificationCount } from "@/server/notifications";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const trader = await getCurrentTrader();

  // Not logged in: render bare (login/register/etc.), no nav chrome. The
  // actual auth requirement is still enforced by each protected page.
  if (!trader) return children;

  const unreadCount = await unreadNotificationCount(trader.id);

  return (
    <PortalShell trader={{ fullName: trader.fullName }} unreadCount={unreadCount}>
      {children}
    </PortalShell>
  );
}
