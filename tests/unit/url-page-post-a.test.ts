import { afterEach, describe, expect, it, vi } from "vitest";

import {
  contentPermalinkPath,
  permalinkCollisions,
  type PermalinkHolder,
} from "@/lib/permalinks/content";
import { pageHref, postHref } from "@/lib/urls";

/**
 * URL-PAGE-POST-a — the permalink model for pages and posts: where each is
 * rendered, and which permalinks are held twice across the four tables. The
 * publication filters are pinned against a real database in
 * url-page-post-a-db.test.ts. Nothing serves content permalinks yet, so the last
 * block pins that the product/category map and rewrite are as URL5-b left them.
 */

describe("contentPermalinkPath: the route a page or a post is rendered from", () => {
  it.each(["da", "en"])("a trust alias lands on its predictable route, in %s", (locale) => {
    expect(contentPermalinkPath({ kind: "page", slug: "about" }, locale)).toBe(`/${locale}/about`);
    expect(contentPermalinkPath({ kind: "page", slug: "om-os" }, locale)).toBe(`/${locale}/about`);
    expect(contentPermalinkPath({ kind: "page", slug: "contact" }, locale)).toBe(`/${locale}/contact`);
    expect(contentPermalinkPath({ kind: "page", slug: "privacy" }, locale)).toBe(`/${locale}/privacy`);
  });

  it.each(["da", "en"])("every other page lands on /info/<slug>, in %s", (locale) => {
    expect(contentPermalinkPath({ kind: "page", slug: "levering" }, locale)).toBe(`/${locale}/info/levering`);
    // `constructor` is an ordinary page, not an inherited property of the alias table.
    expect(contentPermalinkPath({ kind: "page", slug: "constructor" }, locale)).toBe(`/${locale}/info/constructor`);
  });

  it.each(["da", "en"])("a post lands on /blog/<slug>, in %s", (locale) => {
    expect(contentPermalinkPath({ kind: "post", slug: "om-os" }, locale)).toBe(`/${locale}/blog/om-os`);
    expect(contentPermalinkPath({ kind: "post", slug: "spring" }, locale)).toBe(`/${locale}/blog/spring`);
  });

  it("agrees with the links the shop writes (pageHref, postHref) under the default URL options", () => {
    for (const locale of ["da", "en"]) {
      for (const slug of ["about", "om-os", "contact", "privacy", "levering"]) {
        expect(contentPermalinkPath({ kind: "page", slug }, locale)).toBe(pageHref(slug, locale));
      }
      expect(contentPermalinkPath({ kind: "post", slug: "spring" }, locale)).toBe(postHref("spring", locale));
    }
  });

  it("encodes the slug as the product/category rewrite does", () => {
    expect(contentPermalinkPath({ kind: "post", slug: "æble og pære" }, "da")).toBe(
      `/da/blog/${encodeURIComponent("æble og pære")}`,
    );
    expect(contentPermalinkPath({ kind: "page", slug: "a/b" }, "da")).toBe("/da/info/a%2Fb");
  });
});

describe("permalinkCollisions: one key, more than one holder", () => {
  const h = (table: PermalinkHolder["table"], slug: string, permalink: string | null): PermalinkHolder => ({
    table,
    slug,
    permalink,
  });

  it("finds a page and a product holding one permalink, spelled differently", () => {
    const page = h("page", "levering", "/levering/");
    const product = h("product", "x", "https://old.example/levering");
    expect(permalinkCollisions([page, h("category", "c", "/hegn/"), product])).toEqual([
      { key: "/levering", holders: [page, product], crossTable: true },
    ]);
  });

  it("finds a post and a category holding one permalink", () => {
    const post = h("post", "nyhed", "/nyheder/");
    const category = h("category", "nyheder", "/nyheder");
    expect(permalinkCollisions([category, h("page", "p", "/p/"), post])).toEqual([
      { key: "/nyheder", holders: [category, post], crossTable: true },
    ]);
  });

  it("reports one table's two spellings of one key, which the per-table unique lets through", () => {
    const a = h("page", "a", "/om/");
    const b = h("page", "b", "/om");
    expect(permalinkCollisions([a, b])).toEqual([{ key: "/om", holders: [a, b], crossTable: false }]);
  });

  it("reports nothing for one holder per key, and ignores rows with no permalink or no key", () => {
    expect(
      permalinkCollisions([
        h("product", "p", "/a/"),
        h("category", "c", "/b/"),
        h("page", "pg", "/c/"),
        h("post", "ps", "/d/"),
        h("page", "none", null),
        h("post", "none2", null),
        // No key: the proxy never serves `/` or a `..` path, so these hold nothing.
        h("page", "root", "/"),
        h("post", "root2", "/?p=1"),
        h("product", "dots", "/x/../y"),
        h("category", "dots2", "/x/../y"),
      ]),
    ).toEqual([]);
  });

  it("lists every holder of a key, in the order the keys first appear", () => {
    const rows = [
      h("post", "p1", "/b/"),
      h("product", "x", "/a/"),
      h("page", "pg", "/b"),
      h("category", "c", "/a"),
      h("post", "p2", "/B/"),
      h("category", "c2", "/b//"),
    ];
    expect(permalinkCollisions(rows).map((c) => [c.key, c.holders.map((x) => x.slug)])).toEqual([
      ["/b", ["p1", "pg", "c2"]],
      ["/a", ["x", "c"]],
    ]);
  });
});

describe("the product/category map and rewrite are URL5-b's (pages joined in URL-PAGE-POST-b)", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/db");
    vi.resetModules();
  });

  it("readPermalinkMap never reads a post, and with no page permalink the map is product/category only", async () => {
    // URL-PAGE-POST-b reads pages (url-page-post-b.test.ts); none stores a permalink here.
    const page = vi.fn(async () => []);
    const post = vi.fn(async () => [{ slug: "ps", permalink: "/ps/" }]);
    vi.doMock("@/lib/db", () => ({
      prisma: {
        category: { findMany: async () => [{ slug: "hegn", permalink: "/hegn/" }] },
        product: { findMany: async () => [{ slug: "x", permalink: "/hegn/x/" }] },
        page: { findMany: page, findFirst: page },
        post: { findMany: post, findFirst: post },
      },
    }));
    const { readPermalinkMap, resolvePermalinkRewrite } = await import("@/lib/permalinks/resolve-request");
    const map = await readPermalinkMap();
    expect({ ...map }).toEqual({
      "/hegn": { kind: "category", slug: "hegn" },
      "/hegn/x": { kind: "product", slug: "x" },
    });
    expect(post).not.toHaveBeenCalled();

    const routing = { locales: ["da", "en"], defaultLocale: "da" } as const;
    expect(resolvePermalinkRewrite("/da/hegn/x/", map, routing)).toEqual({ path: "/da/product/x", locale: "da" });
    expect(resolvePermalinkRewrite("/en/hegn", map, routing)).toEqual({ path: "/en/category/hegn", locale: "en" });
    expect(resolvePermalinkRewrite("/hegn/x", map, routing)).toEqual({ unprefixed: true });
    expect(resolvePermalinkRewrite("/da/pg/", map, routing)).toBeNull();
    expect(resolvePermalinkRewrite("/hegn/x/", map, { ...routing, localePrefix: "never" })).toEqual({
      path: "/da/product/x",
      locale: "da",
    });
  });
});
