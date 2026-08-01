import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

describe("the active pack's own `mixable` override", () => {
  /**
   * `MIXABLE_DESIGN_SLUGS` can only ever answer for BUILT-IN slugs, so a pack a
   * customer writes (Blank Canvas / the premium-design path) was refused every
   * neutral Part no matter what it declared — even though `mixable` is the
   * documented pack-local way to say "my tokens are cw-coherent"
   * (designs/types.ts) and `resolveMixable` already honoured it in the one
   * other place that consulted it (`designTracksPalette` → the mixer-preview
   * locked-look notice). These pin the third argument: supplied, the PACK
   * decides; omitted, the slug set does.
   */
  const megaFooter = getChromeMeta("mega-footer")!;
  const fableHeader = getChromeMeta("fable-header")!;
  const haloHeader = getChromeMeta("halo-header")!;
  const CUSTOM = "acme-bespoke"; // not in DESIGN_OPTIONS, not in the slug set

  it("lets a pack outside the built-in set opt IN", () => {
    expect(isChromeSelectable(megaFooter, CUSTOM)).toBe(false);
    expect(isChromeSelectable(megaFooter, CUSTOM, true)).toBe(true);
    expect(isChromeSelectable(fableHeader, CUSTOM, true)).toBe(true);
  });

  it("lets a built-in mixable pack opt OUT", () => {
    expect(isChromeSelectable(megaFooter, "aurora-site")).toBe(true);
    expect(isChromeSelectable(megaFooter, "aurora-site", false)).toBe(false);
  });

  it("does not weaken the other two legs of the rule", () => {
    // A locked-theme chrome stays locked to its own design however the ACTIVE
    // pack describes itself: the CHROME's own `mixable: false` is checked
    // before the active pack's field is ever consulted.
    expect(isChromeSelectable(haloHeader, CUSTOM, true)).toBe(false);
    expect(isChromeSelectable(haloHeader, "aurora-site", true)).toBe(false);
    // A design's own chrome is selectable even when the pack opts out.
    expect(isChromeSelectable(fableHeader, "fable", false)).toBe(true);
    // No active design at all is still nothing foreign.
    expect(isChromeSelectable(megaFooter, null, true)).toBe(false);
    expect(isChromeSelectable(megaFooter, undefined, true)).toBe(false);
  });

  // Narrow on purpose: this pins that OMITTING the argument and passing
  // `undefined` are the same call — nothing keys off arity. It is not evidence
  // that the fallback matches the old behaviour; the concrete pre-change
  // answers are asserted by the "isChromeSelectable: own design always; …" and
  // parseChromeConfig cases above, which pass no third argument at all.
  it("omitting the argument behaves exactly like passing `undefined`", () => {
    for (const slug of ["aurora-site", "fable", "nocturne", "halo", CUSTOM]) {
      for (const meta of [megaFooter, fableHeader, haloHeader]) {
        expect(isChromeSelectable(meta, slug, undefined), `${meta.key} on ${slug}`).toBe(
          isChromeSelectable(meta, slug),
        );
      }
    }
  });

  it("parseChromeConfig threads it to the same decision", () => {
    const raw = JSON.stringify({ footerKey: "mega-footer" });
    // Custom pack: dropped by the slug set, kept once the pack opts in.
    expect(parseChromeConfig(raw, CUSTOM)).toBeNull();
    expect(parseChromeConfig(raw, CUSTOM, true)).toEqual({ footerKey: "mega-footer" });
    // Built-in pack opting out drops a selection that used to survive.
    expect(parseChromeConfig(raw, "aurora-site")).toEqual({ footerKey: "mega-footer" });
    expect(parseChromeConfig(raw, "aurora-site", false)).toBeNull();
    // Fail-soft is unchanged — junk is still junk whatever the pack says.
    expect(parseChromeConfig("not json{", CUSTOM, true)).toBeNull();
  });

  it("ENGINE ONLY — no shipped pack declares a `mixable` that differs from the slug set", () => {
    /**
     * The byte-identical claim behind wiring this onto the render path
     * (lib/theme.ts): in THIS repo no pack declares a `mixable` that differs
     * from `MIXABLE_DESIGN_SLUGS`, so threading the field changes nothing for
     * any shop running a shipped design.
     *
     * Engine-only on purpose. In a customer scaffold `designs/` is the
     * customer's own code and an override is the whole point of the feature —
     * asserting agreement there would turn "I used the documented extension
     * point" into a failing `pnpm test`. The marker is release.json's channel,
     * which is "source" only in the engine repo (the release-sync rewrites it
     * to stable/next when the template is published).
     *
     * Read from source rather than importing `@/designs`: that barrel
     * statically pulls every pack (~2 s per test file — the leaf-modules
     * lesson) and this only needs the literal. Blind spots, kept honest: the
     * scan sees a `mixable:` that starts its own line (a single-line object
     * literal is missed), takes the FIRST hit per file (a directory exporting
     * two packs records one), and keys by DIRECTORY name — true of all 28 packs
     * today, but a pack whose folder differs from its `slug:` would be checked
     * against the wrong set membership. It is a tripwire, not a proof.
     *
     * The channel gate also silences it on the `next` mirror snapshot, which is
     * a verbatim engine copy rather than a customer project — `next` cannot be
     * told apart from a scaffold cut with `--ref next`, so fork-CI does not get
     * this tripwire. The engine's own CI does.
     *
     * If this fails in the engine, a shipped pack has started overriding its
     * mixability. That is legitimate — but it CHANGES which chrome Parts that
     * design offers and keeps, so update this deliberately, not reflexively.
     */
    let channel: string | undefined;
    try {
      channel = JSON.parse(
        readFileSync(join(process.cwd(), ".cartwright", "release.json"), "utf8"),
      ).channel;
    } catch {
      channel = undefined;
    }
    if (channel !== "source") return; // customer scaffold — overrides are theirs to make

    const declared = new Map<string, boolean>();
    for (const entry of readdirSync(join(process.cwd(), "designs"), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      let source: string;
      try {
        source = readFileSync(join(process.cwd(), "designs", entry.name, "index.ts"), "utf8");
      } catch {
        continue; // not a pack directory
      }
      const m = source.match(/^\s*mixable:\s*(true|false)\b/m);
      if (m) declared.set(entry.name, m[1] === "true");
    }
    // Non-vacuity floor: in the engine, ember declares `mixable: true`. If the
    // scan stops finding it, the scan broke — not the packs.
    expect(declared.get("ember")).toBe(true);

    for (const [slug, value] of declared) {
      expect(value, `designs/${slug} declares mixable: ${value}`).toBe(
        MIXABLE_DESIGN_SLUGS.has(slug),
      );
    }
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
