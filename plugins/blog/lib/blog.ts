import "server-only";

import { prisma } from "@/lib/db";
import { brand } from "@/brand.config";

/**
 * Blog data-lag. Læser Post-tabellen. Kun published posts eksponeres på
 * storefront. Locale-håndtering matcher Page (translations.<locale>.{title,body,…}),
 * locale-generisk via brand.config (ikke hardkodet "en").
 * `tags` lagres som JSON-streng (SQLite har ingen scalar-lists).
 */

export type PostSummary = {
  slug: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  author: string | null;
  publishedAt: Date | null;
  tags: string[];
};

export type PostView = PostSummary & {
  body: string;
  metaTitle: string | null;
  metaDescription: string | null;
  vibeHtml: string | null;
};

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

type PostRow = {
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  coverImage: string | null;
  author: string | null;
  publishedAt: Date | null;
  tags: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  vibeHtml: string | null;
  translations: unknown;
};

function localize(
  post: PostRow,
  locale: string,
): { title: string; body: string; excerpt: string | null; vibeHtml: string | null } {
  let title = post.title;
  let body = post.body;
  let excerpt = post.excerpt;
  let vibeHtml = post.vibeHtml;
  if (locale !== brand.defaultLocale && post.translations && typeof post.translations === "object") {
    const t = (post.translations as Record<
      string,
      { title?: string; body?: string; excerpt?: string; vibeHtml?: string }
    >)[locale];
    if (t?.title) title = t.title;
    if (t?.body) body = t.body;
    if (t?.excerpt) excerpt = t.excerpt;
    if (t?.vibeHtml) vibeHtml = t.vibeHtml;
  }
  return { title, body, excerpt, vibeHtml };
}

export async function listPublishedPosts(): Promise<PostSummary[]> {
  const posts = await prisma.post.findMany({
    where: { status: "published" },
    orderBy: { publishedAt: "desc" },
    select: {
      slug: true,
      title: true,
      excerpt: true,
      coverImage: true,
      author: true,
      publishedAt: true,
      tags: true,
    },
  });
  return posts.map((p) => ({
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    coverImage: p.coverImage,
    author: p.author,
    publishedAt: p.publishedAt,
    tags: parseTags(p.tags),
  }));
}

export async function getPublishedPost(
  slug: string,
  locale: string,
): Promise<PostView | null> {
  const post = await prisma.post.findUnique({ where: { slug } });
  if (!post || post.status !== "published") return null;
  const { title, body, excerpt, vibeHtml } = localize(post as PostRow, locale);
  return {
    slug: post.slug,
    title,
    body,
    excerpt,
    coverImage: post.coverImage,
    author: post.author,
    publishedAt: post.publishedAt,
    tags: parseTags(post.tags),
    metaTitle: post.metaTitle,
    metaDescription: post.metaDescription,
    vibeHtml,
  };
}
