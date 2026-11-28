import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/app/generated/prisma/client";
import { PUBLISHED_PAGE_WHERE, PUBLISHED_POST_WHERE } from "@/lib/permalinks/content";

/**
 * URL-PAGE-POST-a — the publication filters, on a real libSQL file built from
 * the migration baseline: a page or post may be served at its permalink exactly
 * when the route that renders it serves it. The routes' own readers run against
 * the same rows (`findPublishedPageBySlug` for /info/<slug>, `getPublishedPost`
 * for /blog/<slug>), so the filter cannot drift from them unnoticed.
 */

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
// A shop forked to Postgres generates a client the libSQL adapter cannot drive.
const sqlite =
  existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

const S = vi.hoisted(() => ({ client: null as unknown as object }));
vi.mock("@/lib/db", () => ({
  prisma: new Proxy({}, { get: (_t, key) => Reflect.get(S.client, key) }),
}));

let dir = "";
let prisma: PrismaClient;

const DAY = 86_400_000;
const PAGES = [
  { slug: "levering", status: "published" },
  { slug: "udkast", status: "draft" },
];
const POSTS = [
  { slug: "nyhed", status: "published", publishedAt: new Date(Date.now() - DAY) },
  { slug: "planlagt", status: "published", publishedAt: new Date(Date.now() + 30 * DAY) },
  { slug: "uden-dato", status: "published", publishedAt: null },
  { slug: "kladde", status: "draft", publishedAt: null },
  { slug: "kladde-dateret", status: "draft", publishedAt: new Date(Date.now() - DAY) },
];

beforeAll(async () => {
  if (!sqlite) return;
  dir = mkdtempSync(join(tmpdir(), "cw-url-page-post-"));
  const url = `file:${join(dir, "shop.db")}`;
  const raw = createClient({ url });
  await raw.executeMultiple(readFileSync(join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql"), "utf8"));
  raw.close();
  prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  S.client = prisma;
  for (const p of PAGES) {
    await prisma.page.create({ data: { ...p, title: p.slug, body: "x", permalink: `/old/${p.slug}/` } });
  }
  for (const p of POSTS) {
    await prisma.post.create({ data: { ...p, title: p.slug, body: "x", permalink: `/old/${p.slug}/` } });
  }
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const slugs = (rows: { slug: string }[]) => rows.map((r) => r.slug).sort();

describe.skipIf(!sqlite)("which pages and posts may be served at their permalink", () => {
  it("a page: the published one, never a draft", async () => {
    const rows = await prisma.page.findMany({ where: { permalink: { not: null }, ...PUBLISHED_PAGE_WHERE } });
    expect(slugs(rows)).toEqual(["levering"]);
  });

  it("a page: exactly the ones /info/<slug> renders", async () => {
    const { findPublishedPageBySlug } = await import("@/lib/public-pages");
    const served = await prisma.page.findMany({ where: PUBLISHED_PAGE_WHERE, select: { slug: true } });
    for (const { slug } of PAGES) {
      const rendered = (await findPublishedPageBySlug(slug)) !== null;
      expect([slug, served.some((r) => r.slug === slug)]).toEqual([slug, rendered]);
    }
  });

  it("a post: the published ones, whatever their date; never a draft, dated or not", async () => {
    const rows = await prisma.post.findMany({ where: { permalink: { not: null }, ...PUBLISHED_POST_WHERE } });
    expect(slugs(rows)).toEqual(["nyhed", "planlagt", "uden-dato"]);
  });

  it("a post: exactly the ones /blog/<slug> renders, so an old address never 404s while the new one answers", async () => {
    const { getPublishedPost } = await import("@/lib/blog");
    const served = await prisma.post.findMany({ where: PUBLISHED_POST_WHERE, select: { slug: true } });
    for (const { slug } of POSTS) {
      const rendered = (await getPublishedPost(slug, "da")) !== null;
      expect([slug, served.some((r) => r.slug === slug)]).toEqual([slug, rendered]);
    }
  });
});
