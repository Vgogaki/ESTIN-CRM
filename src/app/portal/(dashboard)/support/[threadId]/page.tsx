import { notFound, redirect } from "next/navigation";
import { getCurrentTrader } from "@/server/auth/guard";
import { getThreadForTrader } from "@/server/support";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { MessageList, ReplyForm } from "@/components/support-thread";

export default async function PortalThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const trader = await getCurrentTrader();
  if (!trader) redirect("/portal/login");
  const { threadId } = await params;
  const thread = await getThreadForTrader(threadId, trader.id);
  if (!thread) notFound();

  return (
    <div>
      <PageHeader title={thread.subject} backHref="/portal/support" backLabel="Support" />
      <div className="mb-4">
        <Badge tone={thread.status === "resolved" ? "success" : "accent"}>{thread.status.replace("_", " ")}</Badge>
      </div>
      <MessageList
        base="/api/portal/support"
        messages={thread.messages.map((m) => ({
          id: m.id,
          author: m.authorType,
          authorName: m.authorType === "admin" ? "ESTIN Support" : "You",
          body: m.body,
          createdAt: m.createdAt.toISOString(),
          attachments: m.attachments.map((a) => ({ id: a.id, originalName: a.originalName })),
        }))}
      />
      <ReplyForm
        url={`/api/portal/support/threads/${thread.id}/messages`}
        label={thread.status === "resolved" ? "Reopen with a message" : "Send reply"}
      />
    </div>
  );
}
