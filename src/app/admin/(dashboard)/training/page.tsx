import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { listArticlesForAdmin, SECTIONS } from "@/server/training";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function AdminTrainingPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "content.manage")) {
    return <Alert tone="danger">You don&apos;t have permission to view this.</Alert>;
  }
  const articles = await listArticlesForAdmin();

  return (
    <div>
      <PageHeader title="Training content" subtitle="Articles and guides traders see under Learn in their portal." />
      <div className="mb-4 flex items-center justify-between gap-3">
        <Alert tone="warning">
          Keep educational articles general. Anything that reads as personal investment advice or a recommendation to
          trade is out of scope, and the portal adds a disclaimer under every article. The rules of each challenge are
          generated automatically from the live challenge settings, so you don&apos;t write those here.
        </Alert>
        <Link href="/admin/training/new" className="whitespace-nowrap rounded-md bg-acc px-4 py-2 text-sm font-semibold text-white">
          New article
        </Link>
      </div>
      {SECTIONS.map((s) => {
        const items = articles.filter((a) => a.section === s.key);
        return (
          <section key={s.key} className="mb-6">
            <h2 className="mb-2 text-sm font-semibold">{s.label}</h2>
            {items.length === 0 ? (
              <Card className="p-4 text-sm text-sub">No articles.</Card>
            ) : (
              <div className="flex flex-col gap-2">
                {items.map((a) => (
                  <Link key={a.id} href={`/admin/training/${a.id}`}>
                    <Card className="flex items-center justify-between gap-3 p-4 hover:border-acc">
                      <div>
                        <p className="text-sm font-medium">{a.title}</p>
                        {a.summary && <p className="text-xs text-sub">{a.summary}</p>}
                      </div>
                      <Badge tone={a.published ? "success" : "neutral"}>{a.published ? "published" : "draft"}</Badge>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
