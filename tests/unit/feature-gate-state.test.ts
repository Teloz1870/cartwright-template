import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `getFeatureGateState().available` — is the runtime feature view authoritative?
 *
 * The public agent surface (`mcpPublicDisabledResponse`, lib/tools/public-gate.ts)
 * opens only when `available && features.mcpPublic`. The `available` half is
 * what keeps a surface the admin switched OFF in the database from reopening
 * when that database fails: `fetchBrand()` (lib/data-source/brand.ts) answers a
 * thrown read with brand.config's defaults — fine for rendering — but marks it
 * `source: "unavailable"`, and `getFeatureGateState()` (lib/brand.ts) turns
 * that into `available: false`.
 *
 * Every other test of that gate mocks `@/lib/brand`, so none of them ran this
 * step: replacing it with `available: true` left them all green. Here only the
 * database (`@/lib/db`) and the config are mocked; `getBrand()`, `fetchBrand()`
 * and the gate itself are the real code.
 *
 * The config enables `mcpPublic` on purpose: that is the case where an outage
 * would reopen a DB-disabled surface if `available` were not consulted.
 */

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { brandingSettings: { findUnique: mocks.findUnique } },
}));
vi.mock("@/brand.config", () => ({
  brand: {
    storeName: "config-shop.example",
    storeSlug: "config-shop",
    domain: "config-shop.example",
    url: "https://config-shop.example",
    tagline: "Config tagline",
    mode: "webshop",
    ecommerceEnabled: true,
    industryTemplate: "generic",
    defaultLocale: "en",
    identitySovereignty: "config",
    emails: {
      from: "noreply@config-shop.example",
      fromName: "Config Shop",
      support: "support@config-shop.example",
      admin: "admin@config-shop.example",
    },
    logo: {
      markPaths: ["M0 0h24v24H0z"],
      markViewBox: "0 0 24 24",
      markStrokeWidth: 2,
      markClass: "",
      markTransform: null,
      faviconBg: "#000000",
      faviconFg: "#ffffff",
    },
    features: { mcpPublic: true },
  },
}));

import { getBrand, getFeatureGateState, invalidateBrandCache } from "@/lib/brand";
import { mcpPublicDisabledResponse } from "@/lib/tools/public-gate";

/** The settings row an admin leaves behind after switching the surface off. */
const ROW_MCP_OFF = {
  id: 1,
  storeName: null,
  featureOverridesJson: JSON.stringify({ mcpPublic: false }),
};

describe("getFeatureGateState().available", () => {
  beforeEach(() => {
    // getBrand() caches every result for 30 s — including an outage's.
    invalidateBrandCache();
    mocks.findUnique.mockReset();
  });

  it("is false when the DB read throws, and the gate stays closed although config enables the surface", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.findUnique.mockRejectedValue(new Error("libsql: connection refused"));

    const state = await getFeatureGateState();
    warn.mockRestore();

    expect(mocks.findUnique).toHaveBeenCalledTimes(1);
    expect((await getBrand()).source).toBe("unavailable");
    expect(state.available).toBe(false);
    // Rendering still gets the config view — that is the fail-soft half…
    expect(state.features.mcpPublic).toBe(true);
    // …and the gate refuses anyway — the fail-closed half.
    const res = await mcpPublicDisabledResponse();
    expect(res?.status).toBe(404);
  });

  it("is true when the DB read succeeds, and the row's override is the view the gate uses", async () => {
    mocks.findUnique.mockResolvedValue(ROW_MCP_OFF);

    const state = await getFeatureGateState();

    expect((await getBrand()).source).toBe("db");
    expect(state.available).toBe(true);
    expect(state.features.mcpPublic).toBe(false);
  });

  it("is true when the DB answers with no settings row — brand.config is then the whole truth, so the gate opens", async () => {
    mocks.findUnique.mockResolvedValue(null);

    const state = await getFeatureGateState();

    expect((await getBrand()).source).toBe("fallback");
    expect(state.available).toBe(true);
    expect(state.features.mcpPublic).toBe(true);
    expect(await mcpPublicDisabledResponse()).toBeNull();
  });
});
