import type { TrainingSection } from "@prisma/client";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { ValidationError } from "@/server/errors";

export const SECTIONS: readonly { key: TrainingSection; label: string; blurb: string }[] = [
  { key: "platform_how_to", label: "Using the platform", blurb: "How to use your account, the dashboard and the trading platform." },
  { key: "challenge_rules", label: "Challenge rules", blurb: "What each challenge requires, generated from its live settings." },
  { key: "risk_management", label: "Risk management", blurb: "Staying inside the loss limits." },
  { key: "trading_education", label: "Trading education", blurb: "General educational material." },
];

/** Shown under every article. Educational content must never read as personal advice (modules-to-design 7.5). */
export const EDUCATION_DISCLAIMER =
  "This material is for general education only. It is not investment advice or a recommendation to trade any instrument, and it takes no account of your circumstances. Accounts are simulated.";

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Only plain https links are accepted for video: we link out, we never embed third-party scripts. */
export function validateVideoUrl(url: string | null | undefined): string | null {
  const v = url?.trim();
  if (!v) return null;
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    throw new ValidationError("The video link isn't a valid web address.");
  }
  if (parsed.protocol !== "https:") throw new ValidationError("The video link must start with https://.");
  return parsed.toString();
}

type ArticleInput = {
  section: TrainingSection;
  title: string;
  summary?: string | null;
  body: string;
  videoUrl?: string | null;
  sortOrder?: number;
};

function clean(input: ArticleInput) {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new ValidationError("Give the article a title.");
  if (!body) throw new ValidationError("The article needs some text.");
  if (!SECTIONS.some((s) => s.key === input.section)) throw new ValidationError("Unknown section.");
  return {
    section: input.section,
    title,
    summary: input.summary?.trim() || null,
    body,
    videoUrl: validateVideoUrl(input.videoUrl),
    sortOrder: input.sortOrder ?? 0,
  };
}

async function uniqueSlug(title: string, ignoreId?: string): Promise<string> {
  let base = slugify(title) || "article";
  if (base === "rules") base = "rules-article"; // /portal/learn/rules is the generated rules page
  let slug = base;
  for (let n = 2; ; n++) {
    const hit = await db.trainingArticle.findUnique({ where: { slug } });
    if (!hit || hit.id === ignoreId) return slug;
    slug = `${base}-${n}`;
  }
}

export async function createArticle(input: ArticleInput & { adminId: string; ipAddress: string }) {
  const data = clean(input);
  const article = await db.trainingArticle.create({ data: { ...data, slug: await uniqueSlug(data.title), createdById: input.adminId } });
  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "training.article_created",
    entityType: "TrainingArticle",
    entityId: article.id,
    after: { title: article.title, section: article.section },
    ipAddress: input.ipAddress,
  });
  return article;
}

export async function updateArticle(input: ArticleInput & { id: string; adminId: string; ipAddress: string }) {
  const before = await db.trainingArticle.findUnique({ where: { id: input.id } });
  if (!before || before.archivedAt) throw new ValidationError("Article not found.", 404);
  const data = clean(input);
  const article = await db.trainingArticle.update({ where: { id: input.id }, data });
  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "training.article_updated",
    entityType: "TrainingArticle",
    entityId: article.id,
    before: { title: before.title, section: before.section, body: before.body, videoUrl: before.videoUrl },
    after: { title: article.title, section: article.section, body: article.body, videoUrl: article.videoUrl },
    ipAddress: input.ipAddress,
  });
  return article;
}

export async function setPublished(input: { id: string; published: boolean; adminId: string; ipAddress: string }) {
  const before = await db.trainingArticle.findUnique({ where: { id: input.id } });
  if (!before || before.archivedAt) throw new ValidationError("Article not found.", 404);
  const article = await db.trainingArticle.update({
    where: { id: input.id },
    data: { published: input.published, publishedAt: input.published ? (before.publishedAt ?? new Date()) : before.publishedAt },
  });
  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: input.published ? "training.article_published" : "training.article_unpublished",
    entityType: "TrainingArticle",
    entityId: article.id,
    ipAddress: input.ipAddress,
  });
  return article;
}

/** Records are never hard-deleted: archiving hides the article everywhere and keeps who/when/why. */
export async function archiveArticle(input: { id: string; reason: string; adminId: string; ipAddress: string }) {
  if (!input.reason.trim()) throw new ValidationError("Say why you are archiving this article.");
  const before = await db.trainingArticle.findUnique({ where: { id: input.id } });
  if (!before || before.archivedAt) throw new ValidationError("Article not found.", 404);
  await db.trainingArticle.update({
    where: { id: input.id },
    data: { archivedAt: new Date(), archiveReason: input.reason.trim(), published: false },
  });
  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "training.article_archived",
    entityType: "TrainingArticle",
    entityId: input.id,
    before: { published: before.published },
    reason: input.reason.trim(),
    ipAddress: input.ipAddress,
  });
}

export async function listArticlesForAdmin() {
  return db.trainingArticle.findMany({ where: { archivedAt: null }, orderBy: [{ section: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }] });
}

export async function getArticleForAdmin(id: string) {
  const a = await db.trainingArticle.findUnique({ where: { id } });
  return a && !a.archivedAt ? a : null;
}

export async function listPublished() {
  return db.trainingArticle.findMany({
    where: { published: true, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function getPublishedBySlug(slug: string) {
  const a = await db.trainingArticle.findUnique({ where: { slug } });
  return a && a.published && !a.archivedAt ? a : null;
}

/** Live, sellable challenge types, for the auto-generated rules explanations. */
export async function listActiveChallengesForExplainer() {
  return db.challengeType.findMany({
    where: { active: true },
    include: { phases: { orderBy: { order: "asc" } } },
    orderBy: { name: "asc" },
  });
}
