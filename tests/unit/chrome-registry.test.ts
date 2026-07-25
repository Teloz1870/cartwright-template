import { describe, it, expect } from "vitest";
import {
  CHROME_CATALOG,
  getChromeMeta,
  isChromeSelectable,
  parseChromeConfig,
} from "@/lib/builder/chrome-catalog";
import { CHROME_REGISTRY, getChromeComponent } from "@/lib/builder/chrome-registry";
import { CHROME_DESIGN_SLUGS } from "@/designs/chrome-slugs";
import { MIXABLE_DESIGN_SLUGS, DESIGN_OPTIONS } from "@/designs/options";

/**
 * Mixer 2.0 Phase 1 — chrome-registry invariants. The catalogue
 * (lib/builder/chrome-catalog.ts, client-safe data) and the registry
 * (lib/builder/chrome-registry.tsx, server-only components) must stay in
 * lockstep, mixability must follow the cw-* palette-adaptive contract, and
 * parseChromeConfig must be fail-soft (it sits on the storefront render path
 * — junk in BrandingSettings.chromeJson may NEVER break a page).
 */

const NEUTRAL_KEYS = ["minimal-header", "centered-header", "mega-footer", "slim-footer"];
const CW_CHROME_DESIGNS = ["studio", "apex", "jungle", "fable", "stillwater", "ember"];

describe("chrome catalogue ↔ registry lockstep", () => {
  it("every catalogue key has a registry entry with a component + matching meta", () => {
    for (const meta of CHROME_CATALOG) {
      const entry = CHROME_REGISTRY[meta.key];
      expect(entry, `registry entry for "${meta.key}"`).toBeDefined();
      expect(typeof entry.Component).toBe("function");
      expect(entry.kind).toBe(meta.kind);
      expect(entry.label).toBe(meta.label);
      expect(entry.designSlug).toBe(meta.designSlug);
      expect(entry.mixable).toBe(meta.mixable);
    }
  });

  it("the registry has no orphan keys (registry ⊆ catalogue)", () => {
    const catalogKeys = new Set(CHROME_CATALOG.map((m) => m.key));
    for (const key of Object.keys(CHROME_REGISTRY)) {
      expect(catalogKeys.has(key), `orphan registry key "${key}"`).toBe(true);
    }
  });

  it("keys are unique and follow <slug>-header/<slug>-footer or a neutral name", () => {
    const keys = CHROME_CATALOG.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const meta of CHROME_CATALOG) {
      expect(meta.key.endsWith(`-${meta.kind}`), `"${meta.key}" ends with -${meta.kind}`).toBe(
        true,
      );
      if (meta.designSlug) expect(meta.key).toBe(`${meta.designSlug}-${meta.kind}`);
    }
  });

  it("covers exactly CHROME_DESIGN_SLUGS ∩ registered designs (header + footer each) + 4 neutral parts", () => {
    // Intersection, NOT CHROME_DESIGN_SLUGS verbatim: a scaffold profile
    // (create-cartwright light) prunes design packs by codemodding
    // designs/{index,options}.ts — the catalogue must follow the registered
    // set so pruned scaffolds boot and this suite stays green inside them.
    // In the full engine the two sets are identical.
    const registered = new Set(DESIGN_OPTIONS.map((d) => d.slug));
    const expected = [...CHROME_DESIGN_SLUGS].filter((slug) => registered.has(slug));
    const designSlugs = new Set(
      CHROME_CATALOG.filter((m) => m.designSlug).map((m) => m.designSlug as string),
    );
    expect([...designSlugs].sort()).toEqual(expected.sort());
    for (const slug of expected) {
      expect(getChromeMeta(`${slug}-header`)?.kind).toBe("header");
      expect(getChromeMeta(`${slug}-footer`)?.kind).toBe("footer");
    }
    const neutral = CHROME_CATALOG.filter((m) => !m.designSlug).map((m) => m.key);
    expect(neutral.sort()).toEqual([...NEUTRAL_KEYS].sort());
    expect(CHROME_CATALOG.length).toBe(expected.length * 2 + NEUTRAL_KEYS.length);
  });
});

describe("mixability contract", () => {
  it("mixable design chromes ⊆ the cw-* palette-adaptive chrome designs", () => {
    for (const meta of CHROME_CATALOG) {
      if (!meta.designSlug) continue;
      expect(meta.mixable, `${meta.key} mixable`).toBe(CW_CHROME_DESIGNS.includes(meta.designSlug));
    }
  });

  it("every mixable design chrome belongs to a MIXABLE design (cw-coherent)", () => {
    for (const meta of CHROME_CATALOG) {
      if (meta.mixable && meta.designSlug) {
        expect(MIXABLE_DESIGN_SLUGS.has(meta.designSlug), `${meta.key}`).toBe(true);
      }
    }
  });

  it("neutral parts are all mixable and design-agnostic", () => {
    for (const key of NEUTRAL_KEYS) {
      const meta = getChromeMeta(key);
      expect(meta?.mixable).toBe(true);
      expect(meta?.designSlug).toBeUndefined();
    }
  });

  it("isChromeSelectable: own design always; mixable only on mixable designs; locked never foreign", () => {
    const fableHeader = getChromeMeta("fable-header")!;
    const haloHeader = getChromeMeta("halo-header")!;
    const megaFooter = getChromeMeta("mega-footer")!;

    // Own design always works — even a locked one.
    expect(isChromeSelectable(haloHeader, "halo")).toBe(true);
    expect(isChromeSelectable(fableHeader, "fable")).toBe(true);
    // Mixable chrome on mixable designs (incl. no-own-chrome Aurora).
    expect(isChromeSelectable(fableHeader, "aurora-site")).toBe(true);
    expect(isChromeSelectable(megaFooter, "apex")).toBe(true);
    // Mixable chrome on a LOCKED design renders in the default cw palette → not offered.
    expect(isChromeSelectable(megaFooter, "nocturne")).toBe(false);
    expect(isChromeSelectable(fableHeader, "halo")).toBe(false);
    // Locked chrome never on a foreign design.
    expect(isChromeSelectable(haloHeader, "aurora-site")).toBe(false);
    expect(isChromeSelectable(haloHeader, "fable")).toBe(false);
    // Unknown/unset active design → nothing foreign.
    expect(isChromeSelectable(megaFooter, null)).toBe(false);
  });

  it("every catalogue designSlug is a registered design", () => {
    const known = new Set(DESIGN_OPTIONS.map((d) => d.slug));
    for (const meta of CHROME_CATALOG) {
      if (meta.designSlug) expect(known.has(meta.designSlug), meta.key).toBe(true);
    }
  });
});

describe("parseChromeConfig — fail-soft render-path contract", () => {
  it("returns null for null/empty/junk input", () => {
    expect(parseChromeConfig(null, "aurora-site")).toBeNull();
    expect(parseChromeConfig(undefined, "aurora-site")).toBeNull();
    expect(parseChromeConfig("", "aurora-site")).toBeNull();
    expect(parseChromeConfig("not json{", "aurora-site")).toBeNull();
    expect(parseChromeConfig("42", "aurora-site")).toBeNull();
    expect(parseChromeConfig("[1,2]", "aurora-site")).toBeNull();
    expect(parseChromeConfig("{}", "aurora-site")).toBeNull();
  });

  it("accepts valid selectable keys", () => {
    const config = parseChromeConfig(
      JSON.stringify({ headerKey: "fable-header", footerKey: "mega-footer" }),
      "aurora-site",
    );
    expect(config).toEqual({ headerKey: "fable-header", footerKey: "mega-footer" });
  });

  it("drops unknown keys, kind mismatches and non-string values (keeps the rest)", () => {
    expect(
      parseChromeConfig(
        JSON.stringify({ headerKey: "no-such-chrome", footerKey: "slim-footer" }),
        "aurora-site",
      ),
    ).toEqual({ footerKey: "slim-footer" });
    // A footer key in the header slot is a kind mismatch.
    expect(
      parseChromeConfig(JSON.stringify({ headerKey: "mega-footer" }), "aurora-site"),
    ).toBeNull();
    expect(
      parseChromeConfig(JSON.stringify({ headerKey: 7, footerKey: ["slim-footer"] }), "aurora-site"),
    ).toBeNull();
  });

  it("drops keys that are not selectable on the active design (stale locked chrome)", () => {
    // halo-header persisted while halo was active; the shop then switched design.
    expect(
      parseChromeConfig(JSON.stringify({ headerKey: "halo-header" }), "aurora-site"),
    ).toBeNull();
    // …but it is honoured while halo IS the active design.
    expect(parseChromeConfig(JSON.stringify({ headerKey: "halo-header" }), "halo")).toEqual({
      headerKey: "halo-header",
    });
    // A mixable part persisted before switching to a locked design is dropped too.
    expect(
      parseChromeConfig(JSON.stringify({ footerKey: "mega-footer" }), "nocturne"),
    ).toBeNull();
  });
});

describe("getChromeComponent", () => {
  it("resolves registered keys and is undefined-safe", () => {
    expect(getChromeComponent("fable-header")).toBeTypeOf("function");
    expect(getChromeComponent("mega-footer")).toBeTypeOf("function");
    expect(getChromeComponent("nope")).toBeUndefined();
    expect(getChromeComponent(null)).toBeUndefined();
    expect(getChromeComponent(undefined)).toBeUndefined();
  });
});
