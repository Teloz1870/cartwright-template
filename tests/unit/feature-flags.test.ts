import { describe, expect, it } from "vitest";
import { brand } from "@/brand.config";
import {
  FEATURE_MANIFEST,
  RUNTIME_TOGGLEABLE_KEYS,
  type FeatureKey,
} from "@/lib/feature-flags/manifest";
import { mergeFeatureOverrides } from "@/lib/feature-flags/resolve";

/**
 * Feature-management invariants. Hvis disse fejler, er enten sikkerheds-
 * garantien (allowlist-filter) eller manifest↔config-synkroniseringen brudt.
 */

describe("feature manifest ↔ brand.config sync", () => {
  const configKeys = Object.keys(brand.features).sort();
  const manifestKeys = FEATURE_MANIFEST.map((f) => f.key).sort();

  it("har præcis én manifest-entry pr. brand.features-flag", () => {
    expect(manifestKeys).toEqual(configKeys);
  });

  it("designSurfaces er default-off (canary-kritisk: kurv/checkout live)", () => {
    expect(brand.features.designSurfaces).toBe(false);
  });

  it("firstRunWelcome er default-off (engine: canaries strukturelt immune)", () => {
    expect(brand.features.firstRunWelcome).toBe(false);
  });

  it("firstRunWelcome er runtime-tier UDEN ecommerce-precondition", () => {
    const d = FEATURE_MANIFEST.find((f) => f.key === "firstRunWelcome");
    expect(d).toBeDefined();
    expect(d?.tier).toBe("runtime");
    expect(d?.precondition).toBeUndefined();
    expect(d?.implemented).toBe(true);
  });

  it("ingen duplikat-keys i manifestet", () => {
    expect(new Set(manifestKeys).size).toBe(manifestKeys.length);
  });

  it("runtimeToggleable er afledt korrekt af tier", () => {
    for (const f of FEATURE_MANIFEST) {
      expect(f.runtimeToggleable).toBe(f.tier === "runtime");
    }
  });

  it("RUNTIME_TOGGLEABLE_KEYS = præcis de runtime-tier features", () => {
    const expected = FEATURE_MANIFEST.filter((f) => f.tier === "runtime").map(
      (f) => f.key,
    );
    expect([...RUNTIME_TOGGLEABLE_KEYS].sort()).toEqual(expected.sort());
  });
});

describe("mergeFeatureOverrides — allowlist-sikkerhed", () => {
  const defaults = { ...brand.features };

  const aRuntimeKey = [...RUNTIME_TOGGLEABLE_KEYS][0] as FeatureKey;

  it("null/tom → defaults uændret", () => {
    expect(mergeFeatureOverrides(defaults, null)).toEqual(defaults);
    expect(mergeFeatureOverrides(defaults, "")).toEqual(defaults);
    expect(mergeFeatureOverrides(defaults, undefined)).toEqual(defaults);
  });

  it("uparsbar JSON → defaults (fail-soft)", () => {
    expect(mergeFeatureOverrides(defaults, "{ not json")).toEqual(defaults);
    expect(mergeFeatureOverrides(defaults, "[1,2,3]")).toEqual(defaults);
    expect(mergeFeatureOverrides(defaults, "42")).toEqual(defaults);
  });

  it("honorerer en allowlistet key med boolean-værdi", () => {
    const flipped = !defaults[aRuntimeKey];
    const merged = mergeFeatureOverrides(
      defaults,
      JSON.stringify({ [aRuntimeKey]: flipped }),
    );
    expect(merged[aRuntimeKey]).toBe(flipped);
  });

  it("IGNORERER identitets-felter (Phase G-guard)", () => {
    const merged = mergeFeatureOverrides(
      defaults,
      JSON.stringify({
        ecommerceEnabled: true,
        mode: "webshop",
        industryTemplate: "coffee",
      }),
    );
    // Ingen af disse er feature-keys → må aldrig optræde i resultatet.
    expect(merged).toEqual(defaults);
    expect("ecommerceEnabled" in merged).toBe(false);
  });

  it("IGNORERER compile-time-gates (a2a/webshop/voiceShop)", () => {
    const merged = mergeFeatureOverrides(
      defaults,
      JSON.stringify({ a2a: true, webshop: true, voiceShop: true }),
    );
    expect(merged.a2a).toBe(defaults.a2a);
    expect(merged.webshop).toBe(defaults.webshop);
    expect(merged.voiceShop).toBe(defaults.voiceShop);
  });

  it("IGNORERER non-boolean værdier på en ellers allowlistet key", () => {
    const merged = mergeFeatureOverrides(
      defaults,
      JSON.stringify({ [aRuntimeKey]: "yes" }),
    );
    expect(merged[aRuntimeKey]).toBe(defaults[aRuntimeKey]);
  });

  it("muterer ikke defaults-objektet", () => {
    const snapshot = { ...defaults };
    mergeFeatureOverrides(
      defaults,
      JSON.stringify({ [aRuntimeKey]: !defaults[aRuntimeKey] }),
    );
    expect(defaults).toEqual(snapshot);
  });
});
