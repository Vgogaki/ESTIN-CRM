import { redirect } from "next/navigation";
import { getCurrentTrader } from "@/server/auth/guard";
import { listNotifications, markAllNotificationsRead } from "@/server/notifications";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";

export default async function NotificationsPage() {
  const trader = await getCurrentTrader();
  if (!trader) redirect("/portal/login");

  // Read the list (so this render still shows what was unread coming in),
  // then mark everything read — the nav badge clears from the next page on.
  const notifications = await listNotifications(trader.id);
  await markAllNotificationsRead(trader.id);

  return (
    <div>
      <PageHeader title="Notifications" backHref="/portal" backLabel="Your account" />
      {notifications.length === 0 ? (
        <Card className="p-6 text-sm text-sub">No notifications yet.</Card>
      ) : (
        <div className="flex flex-col gap-2">
          {notifications.map((n) => (
            <Card key={n.id} className={`p-4 ${n.readAt === null ? "border-l-2 border-l-acc" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="mt-0.5 text-sm text-sub">{n.body}</p>
                </div>
                <span className="whitespace-nowrap text-xs text-sub">
                  {new Date(n.createdAt).toLocaleString()}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
