import { describe, it, expect, vi, beforeEach } from "vitest";
import { invalidateThemeCache } from "@/lib/theme-cache";

/**
 * The chrome selection on the RENDER path — `getActiveChromeConfig`
 * (lib/theme.ts), awaited on every storefront request from
 * `app/[locale]/layout.tsx` to decide whether the shop's saved header/footer
 * Part still applies.
 *
 * Why a separate file with mocks: `lib/theme.ts` resolves the ACTIVE PACK and
 * passes the pack's own `mixable` into `parseChromeConfig`. Nothing in the repo
 * can distinguish that from the old slug-only call, because no shipped pack
 * declares a `mixable` that DIFFERS from the slug set (see the engine-only
 * invariant in chrome-registry.test.ts) — so without a fabricated pack the
 * threading is assertion, not test, and deleting the argument stays green.
 *
 * `@/designs` is mocked rather than imported: the real barrel statically pulls
 * every design pack (~2 s per test file — the leaf-modules lesson).
 */

const fetchDesignSettings = vi.fn();
const fetchChromeSettings = vi.fn();
const getDesign = vi.fn();

vi.mock("@/lib/data-source/brand", () => ({
  fetchThemeSettings: vi.fn(async () => null),
  fetchDesignSettings: (...args: unknown[]) => fetchDesignSettings(...args),
  fetchChromeSettings: (...args: unknown[]) => fetchChromeSettings(...args),
}));

vi.mock("@/designs", () => ({
  getDesign: (...args: unknown[]) => getDesign(...args),
  inferDesignFromIndustry: () => "aurora-site",
}));

/**
 * Mocked too, and load-bearing: `getActiveDesign` resolves
 * `brand.designSlug ?? row?.designSlug ?? infer(...)`, so a project that picked
 * its design the documented way — `designSlug: "blank"` in brand.config.ts —
 * would override the row this test sets, and these cases would fail (or worse,
 * pass for the wrong reason) in that customer's `pnpm test`. This file ships to
 * every scaffold, so it must not depend on the project's own config.
 */
vi.mock("@/brand.config", () => ({
  brand: { designSlug: undefined, industryTemplate: "generic", ecommerceEnabled: false },
}));

/**
 * Minimal stand-in — `getActiveChromeConfig` reads only slug + mixable — wired
 * so the DB row actually decides which pack comes back, the way `getDesign`
 * does in production. (A `getDesign` that ignored its argument would make
 * `fetchDesignSettings` decorative and the saved-slug leg untested.)
 */
const packFor = (slug: string, mixable?: boolean) => (asked: string) =>
  asked === slug ? { slug, mixable } : undefined;

const SAVED_NEUTRAL_FOOTER = JSON.stringify({ footerKey: "mega-footer" });

describe("getActiveChromeConfig — the active pack decides, not just its slug", () => {
  beforeEach(() => {
    // reset, not clear: clearAllMocks keeps implementations, so a stale
    // mockReturnValue would leak into a case that forgot to set its own.
    vi.resetAllMocks();
    invalidateThemeCache(); // the resolution is cached (CACHE_TTL_MS, 30 s)
    fetchChromeSettings.mockResolvedValue({ chromeJson: SAVED_NEUTRAL_FOOTER });
  });

  it("keeps a neutral Part on a CUSTOM pack that declares mixable: true", async () => {
    // The motivating case: slug outside MIXABLE_DESIGN_SLUGS, pack opts in.
    fetchDesignSettings.mockResolvedValue({ designSlug: "acme-bespoke" });
    getDesign.mockImplementation(packFor("acme-bespoke", true));

    const { getActiveChromeConfig } = await import("@/lib/theme");
    expect(await getActiveChromeConfig()).toEqual({ footerKey: "mega-footer" });
  });

  it("drops the same Part when that pack declares nothing (slug-set answer)", async () => {
    fetchDesignSettings.mockResolvedValue({ designSlug: "acme-bespoke" });
    getDesign.mockImplementation(packFor("acme-bespoke", undefined));

    const { getActiveChromeConfig } = await import("@/lib/theme");
    expect(await getActiveChromeConfig()).toBeNull();
  });

  it("drops it on a BUILT-IN mixable pack that opts out with mixable: false", async () => {
    fetchDesignSettings.mockResolvedValue({ designSlug: "aurora-site" });
    getDesign.mockImplementation(packFor("aurora-site", false));

    const { getActiveChromeConfig } = await import("@/lib/theme");
    expect(await getActiveChromeConfig()).toBeNull();
  });

  it("is unchanged for a shipped pack that declares nothing", async () => {
    fetchDesignSettings.mockResolvedValue({ designSlug: "aurora-site" });
    getDesign.mockImplementation(packFor("aurora-site", undefined));

    const { getActiveChromeConfig } = await import("@/lib/theme");
    expect(await getActiveChromeConfig()).toEqual({ footerKey: "mega-footer" });
  });

  it("stays fail-soft when the design cannot be resolved at all", async () => {
    fetchDesignSettings.mockResolvedValue({ designSlug: "gone" });
    getDesign.mockImplementation(packFor("still-here")); // asked for "gone" → undefined

    const { getActiveChromeConfig } = await import("@/lib/theme");
    expect(await getActiveChromeConfig()).toBeNull();
  });
});
