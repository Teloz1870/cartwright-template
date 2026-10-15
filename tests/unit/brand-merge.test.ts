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
  // Mode læses ved module-import (efter vi.resetModules), så tests kan skifte
  // mellem webshop- og website-mode ved at sætte denne FØR dynamic import.
  brandMode: "webshop" as "webshop" | "website",
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
    ecommerceEnabled: false,
    emails: {
      from: "noreply@default-shop.dk",
      fromName: "default-shop",
      support: "kontakt@default-shop.dk",
      admin: "admin@default-shop.dk",
    },
    // Default webshop mode so DB identity overrides apply; website-mode tests
    // flip mocks.brandMode (website mode deliberately forces identity from
    // config — see lib/brand.ts isWebsiteMode guard). Getter fordi mock-
    // factoryen kun køres én gang — værdien skal læses ved hvert opslag.
    get mode() {
      return mocks.brandMode;
    },
    // logo defaults must exist — getBrand() spreads brandDefaults.logo and
    // reads its fields; an incomplete mock made getBrand throw → fallback.
    logo: {
      markPaths: ["M0 0h24v24H0z"],
      markViewBox: "0 0 24 24",
      markStrokeWidth: 2,
      markClass: "",
      markTransform: null,
      faviconBg: "#000000",
      faviconFg: "#ffffff",
      imageUrl: null,
    },
  },
}));

describe("getBrand merge-logic", () => {
  beforeEach(async () => {
    vi.resetModules();
    mocks.prisma.brandingSettings.findUnique.mockReset();
    mocks.brandMode = "webshop";
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
    expect(brand.source).toBe("unavailable");
  });

  it("identitySovereignty:'auto' (legacy default) — webshop-mode lader DB override identitet", async () => {
    // Kontrast-case til website-mode-locken nedenfor: under den ARVEDE politik
    // ("auto", default) ER DB-overrides af identitet tilladt i webshop-mode.
    //
    // Denne test er BEVIDST ikke vendt om. Den beskrev faren som tilsigtet
    // adfærd — en fork toggler et urelateret flag og sitet omdøber sig selv —
    // og fixet er ikke at slette beviset, men at gøre politikken eksplicit.
    // Testen dokumenterer nu KOMPATIBILITETS-kontrakten: dens job er at bevise
    // at "auto" forbliver byte-identisk for evigt. Den NYE kontrakt
    // ("config" vinder over en kontamineret række) står i
    // tests/unit/identity-sovereignty.test.ts, med samme fixture, så de to
    // læses som før/efter.
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue({
      id: 1,
      storeName: "kontaminerede-shop.dk",
      ecommerceEnabled: true,
      industryTemplate: "coffee",
      updatedAt: new Date(),
    });
    const { getBrand } = await import("@/lib/brand");
    const brand = await getBrand();
    expect(brand.ecommerceEnabled).toBe(true);
    expect(brand.storeName).toBe("kontaminerede-shop.dk");
    expect(brand.industryTemplate).toBe("coffee");
  });
});

/**
 * Phase G/H regression (Teloz-bliver-webshop-katastrofen, 2026-05-28/29):
 * I website-mode er identiteten suveræn fra brand.config — en delt/kontamineret
 * DB-row må KUN override kosmetik (tagline, domæne, logo), ALDRIG storeName,
 * ecommerceEnabled eller industryTemplate. Uden denne lock renderede Teloz'
 * corporate-site som webshop (cart-ikon, produkt-nav, "Demo store"-banner)
 * når DB-rowen sagde ecommerceEnabled: true.
 */
describe("getBrand website-mode identity lock (Phase G/H)", () => {
  beforeEach(async () => {
    vi.resetModules();
    mocks.prisma.brandingSettings.findUnique.mockReset();
    mocks.brandMode = "website";
  });

  it("DB-row med ecommerceEnabled:true giver STADIG false i website-mode", async () => {
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue({
      id: 1,
      storeName: "northbound-coffee.dk",
      ecommerceEnabled: true,
      industryTemplate: "coffee",
      updatedAt: new Date(),
    });
    const { getBrand } = await import("@/lib/brand");
    const brand = await getBrand();
    expect(brand.ecommerceEnabled).toBe(false);
    expect(brand.source).toBe("db");
  });

  it("storeName og industryTemplate er låst til brand.config i website-mode", async () => {
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue({
      id: 1,
      storeName: "northbound-coffee.dk",
      ecommerceEnabled: true,
      industryTemplate: "coffee",
      tagline: "Kosmetik må gerne overrides",
      domain: "nyt-domæne.dk",
      updatedAt: new Date(),
    });
    const { getBrand } = await import("@/lib/brand");
    const brand = await getBrand();
    // Identitet: låst til config
    expect(brand.storeName).toBe("default-shop.dk");
    expect(brand.industryTemplate).toBe("eyewear");
    // Kosmetik: DB vinder fortsat
    expect(brand.tagline).toBe("Kosmetik må gerne overrides");
    expect(brand.domain).toBe("nyt-domæne.dk");
  });

  it("fallback (ingen DB-row) respekterer config's ecommerceEnabled — hardcoder ALDRIG true", async () => {
    // Selve Phase G-buggen: fallback-objektet opfandt ecommerceEnabled: true
    // når DB var utilgængelig/manglede rowen.
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(null);
    const { getBrand } = await import("@/lib/brand");
    const brand = await getBrand();
    expect(brand.ecommerceEnabled).toBe(false);
    expect(brand.source).toBe("fallback");
  });

  it("DB-throw fallback respekterer også config's ecommerceEnabled", async () => {
    mocks.prisma.brandingSettings.findUnique.mockRejectedValue(
      new Error("schema drift"),
    );
    const { getBrand } = await import("@/lib/brand");
    const brand = await getBrand();
    expect(brand.ecommerceEnabled).toBe(false);
    expect(brand.source).toBe("unavailable");
  });
});
