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
