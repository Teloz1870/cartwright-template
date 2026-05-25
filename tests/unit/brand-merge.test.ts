import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * ULTRAPLAN-lite UL5 regression: getBrand() skal merge DB-overrides ovenpå
 * brand.config defaults korrekt — null-felter falder tilbage, ikke-null
 * felter overrider.
 *
 * Vi mocker prisma + brand.config og verificerer merge-logic isoleret.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    brandingSettings: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("server-only", () => ({}));
vi.mock("@/brand.config", () => ({
  brand: {
    storeName: "default-shop.dk",
    storeSlug: "default",
    domain: "default-shop.dk",
    url: "https://default-shop.dk",
    tagline: "Default tagline",
    industryTemplate: "eyewear",
    emails: {
      from: "noreply@default-shop.dk",
      fromName: "default-shop",
      support: "kontakt@default-shop.dk",
      admin: "admin@default-shop.dk",
    },
  },
}));

describe("getBrand merge-logic", () => {
  beforeEach(async () => {
    vi.resetModules();
    mocks.prisma.brandingSettings.findUnique.mockReset();
  });

  it("returnerer brand.config defaults når DB-row mangler", async () => {
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(null);
    const { getBrand } = await import("@/lib/brand");
    const brand = await getBrand();
    expect(brand.storeName).toBe("default-shop.dk");
    expect(brand.source).toBe("fallback");
  });

  it("DB-værdier override brand.config defaults", async () => {
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue({
      id: 1,
      storeName: "panel-hegn.dk",
      heroImage: "https://example.com/img.jpg",
      announcement: "Sommer-tilbud",
      setupComplete: true,
      tagline: "Galvaniserede hegn",
      domain: "panel-hegn.dk",
      emailFrom: "noreply@panel-hegn.dk",
      emailFromName: null,
      emailSupport: "kontakt@panel-hegn.dk",
      emailAdmin: null,
      industryTemplate: "generic",
      updatedAt: new Date(),
    });
    const { getBrand } = await import("@/lib/brand");
    const brand = await getBrand();
    expect(brand.storeName).toBe("panel-hegn.dk");
    expect(brand.tagline).toBe("Galvaniserede hegn");
    expect(brand.domain).toBe("panel-hegn.dk");
    expect(brand.emails.from).toBe("noreply@panel-hegn.dk");
    expect(brand.emails.support).toBe("kontakt@panel-hegn.dk");
    expect(brand.industryTemplate).toBe("generic");
    expect(brand.source).toBe("db");
    // Nullable felter fallback til defaults
    expect(brand.emails.fromName).toBe("default-shop");
    expect(brand.emails.admin).toBe("admin@default-shop.dk");
  });

  it("falder tilbage til defaults når DB throws", async () => {
    mocks.prisma.brandingSettings.findUnique.mockRejectedValue(new Error("DB ned"));
    const { getBrand } = await import("@/lib/brand");
    const brand = await getBrand();
    expect(brand.storeName).toBe("default-shop.dk");
    expect(brand.source).toBe("fallback");
  });
});
