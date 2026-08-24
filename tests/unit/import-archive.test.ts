import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  absUrl,
  pickFromSrcset,
  extractMedia,
  slugFromUrl,
  buildArchive,
  type ArchivePage,
} from "@/lib/import/archive";

/**
 * Site-import Fase 0 — pure archive helpers (no I/O) + the scrapeSite
 * orchestrator (mocked Firecrawl, no real calls). Mirrors firecrawl-scrape.test
 * (mock the thin wrapper at the consumer boundary).
 */

describe("archive · absUrl", () => {
  it("resolves relative against base, keeps absolute, rejects data:/blank", () => {
    expect(absUrl("/a.jpg", "https://x.dk/p/")).toBe("https://x.dk/a.jpg");
    expect(absUrl("https://y.dk/b.png", "https://x.dk")).toBe("https://y.dk/b.png");
    expect(absUrl("data:image/png;base64,xx", "https://x.dk")).toBeNull();
    expect(absUrl("   ", "https://x.dk")).toBeNull();
  });
});

describe("archive · pickFromSrcset", () => {
  it("picks the highest-width candidate, else the first", () => {
    expect(pickFromSrcset("a.jpg 320w, b.jpg 1024w, c.jpg 640w")).toBe("b.jpg");
    expect(pickFromSrcset("only.jpg 2x")).toBe("only.jpg");
    expect(pickFromSrcset("first.jpg, second.jpg")).toBe("first.jpg");
  });
});

describe("archive · extractMedia", () => {
  it("pulls images (img/data-src/srcset/bg/source/og), pdfs, video-embeds — abs+deduped", () => {
    const html = `
      <img src="/img/a.jpg">
      <img data-src="https://cdn.dk/b.jpg">
      <img srcset="/s/small.jpg 320w, /s/big.jpg 1200w">
      <div style="background-image:url('/bg/hero.jpg')"></div>
      <picture><source src="/pic/p.webp"></picture>
      <a href="/docs/spec.pdf?v=2">Spec</a>
      <iframe src="https://www.youtube.com/embed/XYZ"></iframe>
      <video src="/media/clip.mp4"></video>
      <img src="data:image/png;base64,zzz">
      <img src="/img/a.jpg">
    `;
    const m = extractMedia(html, "https://aluzaun.de/vidual-line/", [], "https://aluzaun.de/og.png");
    expect(m.images).toContain("https://aluzaun.de/img/a.jpg");
    expect(m.images).toContain("https://cdn.dk/b.jpg");
    expect(m.images).toContain("https://aluzaun.de/s/big.jpg"); // highest-width from srcset
    expect(m.images).toContain("https://aluzaun.de/bg/hero.jpg");
    expect(m.images).toContain("https://aluzaun.de/pic/p.webp");
    expect(m.images).toContain("https://aluzaun.de/og.png");
    // data: skipped, and the duplicate /img/a.jpg de-duped
    expect(m.images.filter((u) => u.endsWith("/img/a.jpg"))).toHaveLength(1);
    expect(m.images.some((u) => u.startsWith("data:"))).toBe(false);
    expect(m.documents).toEqual(["https://aluzaun.de/docs/spec.pdf?v=2"]);
    expect(m.videos).toContain("https://www.youtube.com/embed/XYZ");
    expect(m.videos).toContain("https://aluzaun.de/media/clip.mp4");
  });

  it("is empty-safe (no html, no og)", () => {
    expect(extractMedia("", "https://x.dk")).toEqual({ images: [], documents: [], videos: [] });
  });

  it("classifies video embeds by HOST, not substring (no not-youtube.com false positive)", () => {
    const html = `
      <iframe src="https://www.youtube.com/embed/AAA"></iframe>
      <iframe src="https://player.vimeo.com/video/123"></iframe>
      <iframe src="https://youtu.be/BBB"></iframe>
      <iframe src="https://not-youtube.com/widget"></iframe>
      <iframe src="https://maps.google.com/embed"></iframe>
    `;
    const m = extractMedia(html, "https://x.dk");
    expect(m.videos).toContain("https://www.youtube.com/embed/AAA");
    expect(m.videos).toContain("https://player.vimeo.com/video/123");
    expect(m.videos).toContain("https://youtu.be/BBB");
    expect(m.videos).not.toContain("https://not-youtube.com/widget");
    expect(m.videos.some((u) => u.includes("maps.google.com"))).toBe(false);
  });
});

describe("archive · slugFromUrl", () => {
  it("root → index, path → slug, query stripped", () => {
    expect(slugFromUrl("https://x.dk/")).toBe("index");
    expect(slugFromUrl("https://x.dk")).toBe("index");
    expect(slugFromUrl("https://x.dk/vidual-line/")).toBe("vidual-line");
    expect(slugFromUrl("https://x.dk/a/b?c=1")).toBe("a-b");
    expect(slugFromUrl("not-a-url")).toBe("index");
  });
});

describe("archive · buildArchive", () => {
  it("aggregates media counts across pages", () => {
    const pages: ArchivePage[] = [
      { url: "u1", slug: "s1", title: null, description: null, language: null, markdown: "", media: { images: ["a", "b"], documents: ["d"], videos: [] } },
      { url: "u2", slug: "s2", title: null, description: null, language: null, markdown: "", media: { images: ["c"], documents: [], videos: ["v"] } },
    ];
    const a = buildArchive("https://x.dk", pages);
    expect(a.site).toBe("https://x.dk");
    expect(a.counts).toEqual({ pages: 2, images: 3, documents: 1, videos: 1 });
  });
});

// ── scrapeSite orchestrator (mock the thin Firecrawl wrappers) ───────────────
const mocks = vi.hoisted(() => ({ mapSite: vi.fn(), scrapeUrl: vi.fn() }));
vi.mock("@/lib/firecrawl", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, mapSite: mocks.mapSite, scrapeUrl: mocks.scrapeUrl };
});

describe("scrapeSite", () => {
  beforeEach(() => {
    mocks.mapSite.mockReset();
    mocks.scrapeUrl.mockReset();
  });

  it("fails soft when Firecrawl is unconfigured (mapSite → null)", async () => {
    mocks.mapSite.mockResolvedValue(null);
    const { scrapeSite } = await import("@/lib/import/scrape-site");
    const r = await scrapeSite("https://x.dk");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/FIRECRAWL_API_KEY/);
    expect(mocks.scrapeUrl).not.toHaveBeenCalled();
  });

  it("maps → scrapes each → assembles a SiteArchive with counts", async () => {
    mocks.mapSite.mockResolvedValue(["https://x.dk/a", "https://x.dk/b"]);
    mocks.scrapeUrl.mockImplementation(async (u: string) => ({
      markdown: `# ${u}`,
      html: `<img src="${u}/p.jpg">`,
      metadata: { title: `T ${u}`, description: "d", language: "da", ogImage: `${u}/og.png` },
      images: [],
    }));
    const { scrapeSite } = await import("@/lib/import/scrape-site");
    const r = await scrapeSite("https://x.dk");
    expect(r.ok).toBe(true);
    if (r.ok) {
      // root always included + deduped → x.dk, x.dk/a, x.dk/b
      expect(r.archive.pages.map((p) => p.url)).toEqual([
        "https://x.dk",
        "https://x.dk/a",
        "https://x.dk/b",
      ]);
      expect(r.archive.pages[0].title).toBe("T https://x.dk");
      expect(r.archive.pages[0].slug).toBe("index");
      expect(r.archive.counts.pages).toBe(3);
      expect(r.archive.counts.images).toBe(6); // 2 per page (p.jpg + og.png)
    }
  });

  it("caps at maxPages (free-tier budget) and de-dupes the root", async () => {
    mocks.mapSite.mockResolvedValue(["https://x.dk", "https://x.dk/a", "https://x.dk/b", "https://x.dk/c"]);
    mocks.scrapeUrl.mockResolvedValue({ markdown: "", html: "", metadata: {}, images: [] });
    const { scrapeSite } = await import("@/lib/import/scrape-site");
    const r = await scrapeSite("https://x.dk", { maxPages: 2 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.archive.pages).toHaveLength(2);
    expect(mocks.scrapeUrl).toHaveBeenCalledTimes(2);
  });

  it("skips pages that fail to scrape but keeps going", async () => {
    mocks.mapSite.mockResolvedValue(["https://x.dk/a", "https://x.dk/b"]);
    mocks.scrapeUrl.mockImplementation(async (u: string) =>
      u.endsWith("/a") ? null : { markdown: "ok", html: "", metadata: {}, images: [] },
    );
    const { scrapeSite } = await import("@/lib/import/scrape-site");
    const r = await scrapeSite("https://x.dk");
    expect(r.ok).toBe(true);
    if (r.ok) {
      // root + /b scraped ok, /a skipped (null)
      expect(r.archive.pages.map((p) => p.url)).toEqual(["https://x.dk", "https://x.dk/b"]);
    }
  });

  it("fails soft when no page could be scraped", async () => {
    mocks.mapSite.mockResolvedValue(["https://x.dk/a"]);
    mocks.scrapeUrl.mockResolvedValue(null);
    const { scrapeSite } = await import("@/lib/import/scrape-site");
    const r = await scrapeSite("https://x.dk");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/No pages/);
  });
});
