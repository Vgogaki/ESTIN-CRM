import { notFound, redirect } from "next/navigation";
import { getCurrentTrader } from "@/server/auth/guard";
import { EDUCATION_DISCLAIMER, getPublishedBySlug } from "@/server/training";
import { textToHtml } from "@/server/email/render";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const trader = await getCurrentTrader();
  if (!trader) redirect("/portal/login");
  const { slug } = await params;
  const a = await getPublishedBySlug(slug);
  if (!a) notFound();

  return (
    <div>
      <PageHeader title={a.title} backHref="/portal/learn" backLabel="Learn" />
      <Card className="p-6">
        {/* textToHtml escapes everything first; only paragraphs and links are produced. */}
        <div className="flex flex-col gap-3 text-sm leading-relaxed [&_a]:text-acc [&_a]:underline" dangerouslySetInnerHTML={{ __html: textToHtml(a.body) }} />
        {a.videoUrl && (
          <p className="mt-4 text-sm">
            <a className="text-acc underline" href={a.videoUrl} target="_blank" rel="noopener noreferrer">
              Watch the video
            </a>
          </p>
        )}
      </Card>
      <p className="mt-3 text-xs text-sub">{EDUCATION_DISCLAIMER}</p>
    </div>
  );
}
