/**
 * blog — cartwright-plugin-v1 (plugin wave 2, core-audit §6b №3).
 *
 * The classic CMS story: `/blog` + `/blog/[slug]` storefront routes with
 * BlogPosting + BreadcrumbList JSON-LD, an RSS 2.0 feed, and the `/admin/blog`
 * editor (list / new / edit + server actions). Audit scope: `lib/blog.ts`
 * inbound 10, fully self-contained route tree.
 *
 * PURE DATA module: imports nothing but the contract type, so the
 * marketplace-manifest generator (client-safe) and the drift test can read it.
 *
 * Core-coupling note (honest deviations, left in core):
 *  - `app/sitemap.ts` queries the Post table directly behind
 *    `brand.features.blog` (blog URLs in the sitemap) — core stays untouched.
 *  - `/admin/translations` covers blog Posts via the core dynamic-translation
 *    system (Post.translations is read there generically).
 *
 * Schema note: the `Post` model is plugin-exclusive AND relation-free, so the
 * fragment below is the complete schema surface. v1 install never mutates
 * schema; the fragment surfaces as a "run pnpm db:push" note.
 */
import { PLUGIN_SCHEMA_ID, type CartwrightPluginManifest } from "@/lib/plugins/spec";

export const blogPlugin: CartwrightPluginManifest = {
  schema: PLUGIN_SCHEMA_ID,
  slug: "blog",
  name: "Blog",
  description:
    "A complete blog: /blog index + posts with BlogPosting JSON-LD, RSS feed, and an admin editor with drafts, tags, cover images and SEO fields.",
  version: "1.0.0",
  flag: "blog",
  files: [
    // Self-contained module (source of truth).
    { path: "plugins/blog/manifest.ts" },
    { path: "plugins/blog/lib/blog.ts" },
    { path: "plugins/blog/components/BlogContent.tsx" },
    { path: "plugins/blog/pages/BlogIndexPage.tsx" },
    { path: "plugins/blog/pages/BlogPostPage.tsx" },
    { path: "plugins/blog/api/feed.ts" },
    { path: "plugins/blog/admin/AdminBlogPage.tsx" },
    { path: "plugins/blog/admin/NewPostPage.tsx" },
    { path: "plugins/blog/admin/EditPostPage.tsx" },
    { path: "plugins/blog/admin/BlogPostForm.tsx" },
    { path: "plugins/blog/admin/actions.ts" },
    // Import-path shims (existing scaffolds + tests import these).
    { path: "lib/blog.ts" },
    { path: "components/BlogContent.tsx" },
    { path: "app/admin/blog/actions.ts" },
    { path: "app/admin/blog/BlogPostForm.tsx" },
    // Route mounts (also listed under routeMounts below).
    { path: "app/[locale]/blog/page.tsx" },
    { path: "app/[locale]/blog/[slug]/page.tsx" },
    { path: "app/blog/feed.xml/route.ts" },
    { path: "app/admin/blog/page.tsx" },
    { path: "app/admin/blog/nyt/page.tsx" },
    { path: "app/admin/blog/[id]/page.tsx" },
  ],
  routeMounts: [
    {
      mount: "app/[locale]/blog/page.tsx",
      from: "plugins/blog/pages/BlogIndexPage.tsx",
      exports: ["default", "generateMetadata"],
    },
    {
      mount: "app/[locale]/blog/[slug]/page.tsx",
      from: "plugins/blog/pages/BlogPostPage.tsx",
      exports: ["default", "generateMetadata"],
    },
    {
      mount: "app/blog/feed.xml/route.ts",
      from: "plugins/blog/api/feed.ts",
      exports: ["GET"],
    },
    {
      mount: "app/admin/blog/page.tsx",
      from: "plugins/blog/admin/AdminBlogPage.tsx",
      exports: ["default"],
    },
    {
      mount: "app/admin/blog/nyt/page.tsx",
      from: "plugins/blog/admin/NewPostPage.tsx",
      exports: ["default"],
    },
    {
      mount: "app/admin/blog/[id]/page.tsx",
      from: "plugins/blog/admin/EditPostPage.tsx",
      exports: ["default"],
    },
  ],
  adminNav: [{ href: "/admin/blog", label: "Blog" }],
  prismaFragment: `// Blog-post. Egen model (ikke Page) så blog får blog-semantik: excerpt, author,
// published-state + publishedAt, tags. Body bruger samme lette markdown som Page
// (lib/content.ts: ## / > / **). \`tags\` er en JSON-streng (SQLite har ingen
// scalar-lists). translations som Page (da/en). Gated bag features.blog.
model Post {
  id              String    @id @default(cuid())
  slug            String    @unique
  title           String
  excerpt         String?
  body            String
  bodyFormat      String?
  coverImage      String?
  author          String?
  status          String    @default("draft") // draft | published
  publishedAt     DateTime?
  tags            String? // JSON array of strings
  metaTitle       String?
  metaDescription String?
  translations    Json?
  vibeHtml        String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([status, publishedAt])
}`,
};
