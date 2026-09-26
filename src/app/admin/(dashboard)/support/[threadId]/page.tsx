import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { getThreadForAdmin } from "@/server/support";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { MessageList, ReplyForm } from "@/components/support-thread";
import ThreadStatusButton from "./status-button";

export default async function AdminThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "support.manage")) {
    return <Alert tone="danger">You don&apos;t have permission to view this.</Alert>;
  }
  const { threadId } = await params;
  const thread = await getThreadForAdmin(threadId);
  if (!thread) notFound();

  return (
    <div>
      <PageHeader title={thread.subject} backHref="/admin/support" backLabel="Support" />
      <div className="mb-4 flex items-center gap-3 text-sm">
        <Badge tone={thread.status === "open" ? "warning" : thread.status === "resolved" ? "success" : "accent"}>
          {thread.status.replace("_", " ")}
        </Badge>
        <Link className="text-acc underline" href={`/admin/traders/${thread.personId}`}>
          {thread.person.fullName}
        </Link>
        <span className="text-sub">{thread.category}</span>
        <ThreadStatusButton threadId={thread.id} resolved={thread.status === "resolved"} />
      </div>
      <MessageList
        base="/api/admin/support"
        messages={thread.messages.map((m) => ({
          id: m.id,
          author: m.authorType,
          authorName: m.authorType === "admin" ? (m.authorAdmin?.name ?? "Staff") : thread.person.fullName,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
          attachments: m.attachments.map((a) => ({ id: a.id, originalName: a.originalName })),
        }))}
      />
      <ReplyForm url={`/api/admin/support/threads/${thread.id}/reply`} offerResolve />
    </div>
  );
}
