import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `defaultLocale` must come from `brand.config.ts`, not from a literal.
 *
 * The store-name half of this bug was fixed in v0.41.0 (`brandingCreateDefaults`
 * + a source-scan invariant). The locale half survived, in five places at once:
 *
 *   - `lib/data-source/brand.ts` merged `row.defaultLocale || "da"` — the only
 *     field in that block that consulted neither `brandDefaults` nor the
 *     website-mode lock, while every sibling did;
 *   - `prisma/schema.prisma` declares `@default("da")`, so any row created
 *     without the field is stamped with the engine's locale;
 *   - `brandingCreateDefaults()` omitted it, which meant the v0.41.0 fix was
 *     *systematising* that stamp for exactly the forks it was written to protect;
 *   - the admin writer wrote `?? "da"` to the DB **and** to Redis;
 *   - `i18n/request.ts` carried its own `"da"` in a catch.
 *
 * The failure was split-brain rather than an error: `i18n/routing.ts` reads the
 * static config and serves `/en/…`, while `getBrand()` returned `"da"`, so an
 * English fork's `llms.txt` announced `Language: da` to AI crawlers and
 * `ai-bootstrap` prompted the model in Danish. Nothing threw.
 *
 * THE ASSERTIONS BELOW USE A NON-"da" CONFIG ON PURPOSE. Comparing against the
 * current value would pass against the hardcoded literal too — every canary is
 * `da` — and would first fail for the fork that changes locale, i.e. exactly
 * when it is too late. That hole was real: it shipped in my own branding test in
 * v0.41.0 and had to be corrected in review.
 */

const mocks = vi.hoisted(() => ({
  defaultLocale: "en",
  prisma: { brandingSettings: { findUnique: vi.fn(), findFirst: vi.fn() } },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("server-only", () => ({}));
vi.mock("@/brand.config", () => ({
  brand: {
    storeName: "Nordlys Bageri",
    storeSlug: "nordlys",
    domain: "nordlys.test",
    url: "https://nordlys.test",
    tagline: "Default tagline",
    industryTemplate: "generic",
    ecommerceEnabled: true,
    mode: "webshop",
    images: { hero: "" },
    features: {},
    emails: {
      from: "noreply@nordlys.test",
      fromName: "Nordlys",
      support: "kontakt@nordlys.test",
      admin: "admin@nordlys.test",
    },
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
    // Getter: the mock factory runs once, so the value must be read per access.
    get defaultLocale() {
      return mocks.defaultLocale;
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.defaultLocale = "en";
  mocks.prisma.brandingSettings.findUnique.mockResolvedValue(null);
  mocks.prisma.brandingSettings.findFirst.mockResolvedValue(null);
});

describe("defaultLocale is derived from brand.config", () => {
  it("a silent column resolves to the CONFIG locale, not to 'da'", async () => {
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue({ id: 1, storeName: "Nordlys Bageri", defaultLocale: null });

    const { fetchBrand } = await import("@/lib/data-source/brand");
    const merged = await fetchBrand();

    expect(merged.defaultLocale).toBe("en");
  });

  it("an explicitly stored locale still wins (the admin can genuinely change it)", async () => {
    // Sovereignty is NOT the goal here — this is an honest-fallback fix. An
    // operator who picks a locale in /admin/indstillinger must keep it.
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue({ id: 1, storeName: "Nordlys Bageri", defaultLocale: "da" });

    const { fetchBrand } = await import("@/lib/data-source/brand");
    const merged = await fetchBrand();

    expect(merged.defaultLocale).toBe("da");
  });

  it("follows the config when the config changes (proof it is a derivation)", async () => {
    mocks.defaultLocale = "de";
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue({ id: 1, storeName: "Nordlys Bageri", defaultLocale: "" });

    const { fetchBrand } = await import("@/lib/data-source/brand");
    const merged = await fetchBrand();

    expect(merged.defaultLocale).toBe("de");
  });
});

describe("brandingCreateDefaults seeds the locale", () => {
  it("a newly created row carries the config locale, not the column default", async () => {
    const { brandingCreateDefaults } = await import("@/lib/branding-defaults");

    expect(brandingCreateDefaults().defaultLocale).toBe("en");
  });

  it("follows a different config value (not pinned to any literal)", async () => {
    mocks.defaultLocale = "de";
    vi.resetModules();

    const { brandingCreateDefaults } = await import("@/lib/branding-defaults");

    expect(brandingCreateDefaults().defaultLocale).toBe("de");
  });
});

describe("no locale literal is left in the identity path", () => {
  it("neither the merge nor the create-helper hardcodes a locale", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = join(__dirname, "..", "..");

    for (const file of ["lib/data-source/brand.ts", "lib/branding-defaults.ts"]) {
      const text = readFileSync(join(root, file), "utf8");
      // Strip comments — they legitimately discuss the old "da" literal.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code, `${file} still hardcodes a locale`).not.toMatch(
        /defaultLocale[^\n]*["'](da|en)["']/,
      );
    }
  });
});
