import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/brand", () => ({
  getBrand: vi.fn(async () => ({
    storeName: "Example Shop",
    url: "https://shop.example/",
    metadata: {
      title: "Example Shop — clear products",
      description: "A useful description for people and agents.",
    },
  })),
}));

describe("locale homepage metadata", () => {
  it("keeps canonical, Open Graph and Twitter images in one shared contract", async () => {
    const { buildHomepageMetadata } = await import("@/lib/homepage-metadata");
    const metadata = await buildHomepageMetadata("da");

    expect(metadata.alternates?.canonical).toBe("https://shop.example/da");
    expect(metadata.openGraph).toMatchObject({
      type: "website",
      url: "https://shop.example/da",
      images: [{
        url: "https://shop.example/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Example Shop",
      }],
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      images: ["https://shop.example/opengraph-image"],
    });
  });
});

/**
 * The homepage is the one page that sets its OWN description, so the locale
 * layout's override cannot reach it — and the homepage is the page an agent or
 * a crawler hits first. Measured on the eyewear canary after the layout fix
 * deployed: /en still served a fully Danish description, from here.
 */
describe("the homepage description follows the page's language", () => {
  it("runs it through the localiser with the locale it was given", async () => {
    const src = readFileSync(join(process.cwd(), "lib/homepage-metadata.ts"), "utf8");
    expect(src).toMatch(/localizedBrandCopy\(\s*"metadata\.description"/);
    expect(src).toMatch(/resolved\.metadata\.description,\s*locale,/);
  });

  it("uses the localised value everywhere it writes a description", () => {
    // description, openGraph.description, twitter.description — miss one and
    // the social card an agent reads is still in the wrong language.
    const src = readFileSync(join(process.cwd(), "lib/homepage-metadata.ts"), "utf8");
    const body = src.slice(src.indexOf("return {"));
    expect(body).not.toContain("resolved.metadata.description");
    expect((body.match(/^\s+description,$/gm) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
