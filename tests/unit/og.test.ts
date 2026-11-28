import { describe, it, expect } from "vitest";
import { brand } from "@/brand.config";
import { toAbsoluteUrl, ogImageUrl, pageOg } from "@/lib/og";

describe("toAbsoluteUrl", () => {
  it("prefixes a relative path with brand.url", () => {
    expect(toAbsoluteUrl("/x.png")).toBe(`${brand.url}/x.png`);
    expect(toAbsoluteUrl("x.png")).toBe(`${brand.url}/x.png`);
  });
  it("leaves an absolute URL unchanged", () => {
    expect(toAbsoluteUrl("https://cdn.example.com/a.jpg")).toBe(
      "https://cdn.example.com/a.jpg",
    );
  });
});

describe("ogImageUrl", () => {
  it("builds an encoded /og card URL", () => {
    expect(ogImageUrl("Hello & Co", "A: b")).toBe(
      "/og?title=Hello%20%26%20Co&description=A%3A%20b",
    );
  });
});

describe("pageOg", () => {
  it("uses the generated /og card when no image is given", () => {
    const og = pageOg("Pricing", "Plans");
    const url = ogImageUrl("Pricing", "Plans");
    expect(og.openGraph?.images).toEqual([
      { url, width: 1200, height: 630, alt: "Pricing" },
    ]);
    expect(og.twitter?.images).toEqual([url]);
    expect((og.twitter as { card?: string } | null | undefined)?.card).toBe(
      "summary_large_image",
    );
  });

  it("prefers a real image (hero/cover photo) when provided", () => {
    const og = pageOg("About", "Us", "https://cdn.x/hero.jpg");
    expect(og.openGraph?.images).toEqual([
      { url: "https://cdn.x/hero.jpg", width: 1200, height: 630, alt: "About" },
    ]);
    expect(og.twitter?.images).toEqual(["https://cdn.x/hero.jpg"]);
  });
});
