import { describe, expect, it } from "vitest";

import type { ArchivePage, SiteArchive } from "@/lib/import/archive";
import { buildArchive } from "@/lib/import/archive";
import { classifyPage } from "@/lib/import/classify";
import { planImport } from "@/lib/import/plan-import";

/** Site-import Fase 1.1 — pure classifier + dry-run planner. No I/O. */

function page(p: Partial<ArchivePage> & { url: string; slug: string }): ArchivePage {
  return {
    title: null,
    description: null,
    language: null,
    markdown: "",
    media: { images: [], documents: [], videos: [] },
    ...p,
  };
}

describe("classifyPage", () => {
  it("home = the root (slug 'index')", () => {
    expect(classifyPage(page({ url: "https://x.dk", slug: "index" }))).toBe("home");
  });

  it("legal = privacy/terms/datenschutz/impressum/cookies (whole-segment, multi-lang)", () => {
    expect(classifyPage(page({ url: "https://x.dk/datenschutzerklaerung/", slug: "datenschutzerklaerung" }))).toBe("legal");
    expect(classifyPage(page({ url: "https://x.dk/privacy-policy/", slug: "privacy-policy" }))).toBe("legal");
    expect(classifyPage(page({ url: "https://x.dk/handelsbetingelser/", slug: "handelsbetingelser" }))).toBe("legal");
    // even with a price in the body, a real legal slug stays legal
    expect(classifyPage(page({ url: "https://x.dk/terms/", slug: "terms", markdown: "Refunds over 100 kr." }))).toBe("legal");
  });

  it("contact = contact/kontakt/fachhaendler (whole-segment)", () => {
    expect(classifyPage(page({ url: "https://x.dk/kontakt/", slug: "kontakt" }))).toBe("contact");
    expect(classifyPage(page({ url: "https://x.dk/fachhaendler/", slug: "fachhaendler" }))).toBe("contact");
  });

  it("service = services/ydelser/leistungen (agency mode)", () => {
    expect(classifyPage(page({ url: "https://x.dk/ydelser/webdesign/", slug: "ydelser-webdesign" }))).toBe("service");
    expect(classifyPage(page({ url: "https://x.dk/services/", slug: "services" }))).toBe("service");
  });

  it("blog = a /blog//news/ path segment, or a dated path WITHOUT a product signal", () => {
    expect(classifyPage(page({ url: "https://x.dk/blog/my-post/", slug: "blog-my-post" }))).toBe("blog");
    expect(classifyPage(page({ url: "https://x.dk/2025/06/launch/", slug: "2025-06-launch" }))).toBe("blog");
    // a dated path WITH a price → product, not blog
    expect(classifyPage(page({ url: "https://x.dk/2025/06/sandal/", slug: "2025-06-sandal", markdown: "49 €" }))).toBe("product");
  });

  it("product names that merely CONTAIN a keyword are NOT stolen by legal/contact (codex)", () => {
    expect(classifyPage(page({ url: "https://x.dk/products/cookie-cutter/", slug: "products-cookie-cutter", markdown: "199 kr" }))).toBe("product");
    expect(classifyPage(page({ url: "https://x.dk/products/privacy-screen/", slug: "products-privacy-screen", markdown: "€199" }))).toBe("product");
    expect(classifyPage(page({ url: "https://x.dk/products/contact-grill/", slug: "products-contact-grill", markdown: "99 kr" }))).toBe("product");
  });

  it("product = a price (incl. Danish '10,- kr'), OR spec PDFs + gallery, OR a product route", () => {
    expect(classifyPage(page({ url: "https://x.dk/p/kaffe", slug: "p-kaffe", markdown: "Lækker kaffe — 125 kr" }))).toBe("product");
    expect(classifyPage(page({ url: "https://x.dk/p/sko", slug: "p-sko", markdown: "Pris: 10,- kr" }))).toBe("product");
    expect(
      classifyPage(
        page({ url: "https://x.dk/vidual-line/", slug: "vidual-line", media: { images: ["a", "b", "c"], documents: ["spec.pdf"], videos: [] } }),
      ),
    ).toBe("product");
    expect(classifyPage(page({ url: "https://x.dk/products/lamp/", slug: "products-lamp", media: { images: ["a"], documents: [], videos: [] } }))).toBe("product");
  });

  it("a year + an uppercase name ('© 2024 KR Studio') is NOT a false price (codex)", () => {
    expect(classifyPage(page({ url: "https://x.dk/about/", slug: "about", markdown: "Footer: © 2024 KR Studio · all rights reserved" }))).toBe("page");
  });

  it("page = everything else", () => {
    expect(classifyPage(page({ url: "https://x.dk/about-us/", slug: "about-us", markdown: "We make fences." }))).toBe("page");
    expect(classifyPage(page({ url: "https://x.dk/info/", slug: "info", media: { images: ["a"], documents: ["x.pdf"], videos: [] } }))).toBe("page");
  });
});

describe("planImport", () => {
  it("produces per-page items (with language) + zero-filled byKind + totals", () => {
    const pages: ArchivePage[] = [
      page({ url: "https://x.dk", slug: "index", language: "de" }),
      page({ url: "https://x.dk/datenschutz/", slug: "datenschutz", language: "de" }),
      page({ url: "https://x.dk/p/a", slug: "p-a", markdown: "99 kr", media: { images: ["i"], documents: [], videos: [] } }),
      page({ url: "https://x.dk/about/", slug: "about" }),
    ];
    const plan = planImport(buildArchive("https://x.dk", pages));

    expect(plan.site).toBe("https://x.dk");
    expect(plan.items.map((i) => i.kind)).toEqual(["home", "legal", "product", "page"]);
    expect(plan.items[0].language).toBe("de");
    expect(plan.byKind).toEqual({ home: 1, product: 1, service: 0, blog: 0, legal: 1, contact: 0, page: 1 });
    expect(plan.totals).toEqual({ pages: 4, images: 1, documents: 0, videos: 0 });
  });

  it("derives totals from the actual pages, never from a stale archive.counts (codex)", () => {
    const archive: SiteArchive = {
      site: "https://x.dk",
      pages: [page({ url: "https://x.dk", slug: "index", media: { images: ["a", "b"], documents: ["d"], videos: ["v"] } })],
      counts: { pages: 99, images: 99, documents: 99, videos: 99 }, // deliberately stale/wrong
    };
    const plan = planImport(archive);
    expect(plan.totals).toEqual({ pages: 1, images: 2, documents: 1, videos: 1 });
  });
});
