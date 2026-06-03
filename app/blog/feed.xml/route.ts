import { brand } from "@/brand.config";
import { listPublishedPosts } from "@/lib/blog";

/**
 * RSS 2.0-feed for bloggen på /blog/feed.xml. 404 når features.blog er off.
 * Locale-agnostisk (default-locale-indhold) for enkelhed.
 */
export const dynamic = "force-dynamic";
export const revalidate = 3600;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET() {
  if (!brand.features.blog) {
    return new Response("Not found", { status: 404 });
  }
  const posts = await listPublishedPosts();
  const base = brand.url;

  const items = posts
    .map((p) => {
      const link = `${base}/blog/${p.slug}`;
      const date = p.publishedAt ? new Date(p.publishedAt).toUTCString() : new Date().toUTCString();
      return `    <item>
      <title>${esc(p.title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="true">${esc(link)}</guid>
      <pubDate>${date}</pubDate>
      ${p.excerpt ? `<description>${esc(p.excerpt)}</description>` : ""}
      ${p.author ? `<author>${esc(p.author)}</author>` : ""}
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(brand.storeName)} — Blog</title>
    <link>${esc(`${base}/blog`)}</link>
    <description>${esc(`Artikler og nyheder fra ${brand.storeName}.`)}</description>
    <language>da</language>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
