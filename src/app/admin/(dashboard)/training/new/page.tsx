import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import ArticleEditor from "../article-editor";

export default async function NewArticlePage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "content.manage")) {
    return <Alert tone="danger">You don&apos;t have permission to view this.</Alert>;
  }
  return (
    <div>
      <PageHeader title="New article" backHref="/admin/training" backLabel="Training content" />
      <ArticleEditor initial={{ section: "platform_how_to", title: "", summary: "", body: "", videoUrl: "", sortOrder: 0, published: false }} />
    </div>
  );
}
