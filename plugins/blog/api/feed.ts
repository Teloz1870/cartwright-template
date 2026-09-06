import { brand } from "@/brand.config";
import { getFeatures } from "@/lib/brand";
import { listPublishedPosts } from "@/plugins/blog/lib/blog";

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
  // Resolved, not static: `blog` is a runtime-tier flag, and BlogIndexPage /
  // BlogPostPage both gate on `(await getBrand()).features.blog`. Reading the
  // compile-time value here meant an admin who turned the blog ON got working
  // /blog pages and posts in sitemap.xml, while the RSS feed those pages
  // advertise answered 404 until the next deploy.
  const features = await getFeatures();
  if (!features.blog) {
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
