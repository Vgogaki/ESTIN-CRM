import { notFound, redirect } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { getArticleForAdmin } from "@/server/training";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import ArticleEditor from "../article-editor";

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "content.manage")) {
    return <Alert tone="danger">You don&apos;t have permission to view this.</Alert>;
  }
  const { id } = await params;
  const a = await getArticleForAdmin(id);
  if (!a) notFound();
  return (
    <div>
      <PageHeader title={a.title} backHref="/admin/training" backLabel="Training content" />
      <ArticleEditor
        initial={{
          id: a.id,
          section: a.section,
          title: a.title,
          summary: a.summary ?? "",
          body: a.body,
          videoUrl: a.videoUrl ?? "",
          sortOrder: a.sortOrder,
          published: a.published,
        }}
      />
    </div>
  );
}
