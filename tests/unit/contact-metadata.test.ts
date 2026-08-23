import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/brand", () => ({
  getBrand: vi.fn(async () => ({
    storeName: "Example Shop",
    url: "https://shop.example/",
  })),
}));

describe("locale contact metadata", () => {
  it("uses the runtime brand URL for canonical, hreflang and social metadata", async () => {
    const { buildContactMetadata } = await import("@/lib/contact-metadata");
    const metadata = await buildContactMetadata("da");

    expect(metadata).toMatchObject({
      title: "Kontakt & Kundeservice",
      description: "Kontakt Example Shop — spørgsmål, support og henvendelser.",
      alternates: {
        canonical: "https://shop.example/da/contact",
        languages: {
          "da-DK": "https://shop.example/da/contact",
          en: "https://shop.example/en/contact",
          "x-default": "https://shop.example/da/contact",
        },
      },
      openGraph: {
        title: "Kontakt & Kundeservice",
        images: [{ width: 1200, height: 630 }],
      },
      twitter: {
        card: "summary_large_image",
      },
    });
  });

  it("localizes the English title and description", async () => {
    const { buildContactMetadata } = await import("@/lib/contact-metadata");
    const metadata = await buildContactMetadata("en");

    expect(metadata.title).toBe("Contact & Support");
    expect(metadata.description).toBe(
      "Contact Example Shop for questions, support and inquiries.",
    );
    expect(metadata.alternates?.canonical).toBe(
      "https://shop.example/en/contact",
    );
  });
});
