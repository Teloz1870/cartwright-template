import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { brand } from "@/brand.config";
import {
  isWebsite,
  isWebshop,
  isAgentMarketplace,
  isEcommerce,
  type ModeLike,
} from "@/lib/mode";

/**
 * Locks the "single source of truth" for shop identity. `brand.mode` is
 * canonical; `ecommerceEnabled` and `features.webshop` must stay derivable from
 * it, so the three can never silently drift apart again (the Phase G/H class of
 * bug). If someone sets a webshop mode but leaves features.webshop=false, this
 * fails the build's test gate.
 */
describe("brand identity invariants (brand.config.ts)", () => {
  it("features.webshop mirrors mode === 'webshop'", () => {
    expect(brand.features.webshop).toBe(brand.mode === "webshop");
  });

  it("ecommerceEnabled is consistent with mode (website ⇒ false)", () => {
    // website mode must never sell; non-website modes carry the config value.
    if (brand.mode === "website") {
      expect(brand.ecommerceEnabled).toBe(false);
    } else {
      expect(typeof brand.ecommerceEnabled).toBe("boolean");
    }
  });
});

describe("mode predicates", () => {
  const website: ModeLike = { mode: "website", ecommerceEnabled: false, features: { webshop: false } };
  const webshop: ModeLike = { mode: "webshop", ecommerceEnabled: true, features: { webshop: true } };
  const agent: ModeLike = { mode: "agent-marketplace", ecommerceEnabled: true, features: { webshop: false } };

  it("classifies each mode exactly once", () => {
    expect([isWebsite(website), isWebshop(website), isAgentMarketplace(website)]).toEqual([true, false, false]);
    expect([isWebsite(webshop), isWebshop(webshop), isAgentMarketplace(webshop)]).toEqual([false, true, false]);
    expect([isWebsite(agent), isWebshop(agent), isAgentMarketplace(agent)]).toEqual([false, false, true]);
  });

  it("isEcommerce reads the guarded field when present", () => {
    expect(isEcommerce(website)).toBe(false);
    expect(isEcommerce(webshop)).toBe(true);
  });

  it("isEcommerce derives from mode when the field is absent", () => {
    expect(isEcommerce({ mode: "website" })).toBe(false);
    expect(isEcommerce({ mode: "webshop" })).toBe(true);
    expect(isEcommerce({ mode: "agent-marketplace" })).toBe(true);
  });
});

/**
 * Seed hygiene (Phase G defence-in-depth): the schema default for
 * BrandingSettings.ecommerceEnabled is `true`, so a website-mode shop that
 * doesn't set it explicitly persists a row that SAYS it sells. getBrand()
 * forces website-mode to false at render (locked by brand-merge.test.ts), but
 * the persisted row should match config intent too. This guards the seed from
 * silently dropping the explicit assignment again (source-assertion, same
 * approach as dark-mode-contract.test.ts).
 */
describe("seed persists ecommerceEnabled from config", () => {
  it("BrandingSettings seed sets ecommerceEnabled: brand.ecommerceEnabled", () => {
    const seed = readFileSync(join(process.cwd(), "prisma/seed.ts"), "utf8");
    expect(seed).toMatch(/ecommerceEnabled:\s*brand\.ecommerceEnabled/);
  });
});
