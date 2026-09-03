import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CHROME_CATALOG,
  getChromeMeta,
  isChromeSelectable,
  explainChromeRejection,
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

describe("explainChromeRejection — the refusal an agent has to act on", () => {
  /**
   * Three surfaces refuse a chrome (chrome.set, /admin/designs' setChromeAction,
   * the composition validator) and all three used to interpolate
   * `meta.designSlug` into "only renders on the … design". For a NEUTRAL Part
   * (components/chrome-parts/ — no owning design) that field is `undefined`,
   * and the refusal was not even about the Part: it is mixable, the ACTIVE
   * design is what refuses foreign chrome. The remedy it printed ("pick a
   * mixable chrome") is the one that cannot work.
   *
   * These pin the four reasons apart, and — the load-bearing one — that the
   * explanation can never disagree with `isChromeSelectable`, over the whole
   * catalogue × every registered design.
   */
  const megaFooter = getChromeMeta("mega-footer")!; // neutral, mixable, no designSlug
  const fableHeader = getChromeMeta("fable-header")!; // design chrome, mixable
  const haloHeader = getChromeMeta("halo-header")!; // design chrome, LOCKED
  const CUSTOM = "acme-bespoke"; // not in DESIGN_OPTIONS, not in the slug set
  // A REGISTERED design that refuses foreign chrome by the slug-set answer —
  // exactly the predicate the SUT consults when no `targetMixable` is passed.
  // DERIVED rather than named: a pruned scaffold (light keeps a curated design
  // set) need not ship any particular locked design, and a hardcoded
  // "nocturne" turned 8 cases red in the light release-scaffold-gate
  // (2026-08-07). A profile with no locked design at all makes the cases that
  // need one SKIP — reported honestly, never silently passed.
  const LOCKED_DESIGN = DESIGN_OPTIONS.find((d) => !MIXABLE_DESIGN_SLUGS.has(d.slug))?.slug;

  it("fixture floor — the fixtures sit where these cases need them", () => {
    // Without this, a catalogue edit could make every case below pass for the
    // wrong reason (e.g. a neutral Part that quietly gained a designSlug).
    expect(megaFooter.mixable).toBe(true);
    expect(megaFooter.designSlug).toBeUndefined();
    expect(fableHeader).toMatchObject({ mixable: true, designSlug: "fable" });
    expect(haloHeader).toMatchObject({ mixable: false, designSlug: "halo" });
    // The engine default must accept foreign mixable chrome in EVERY profile.
    expect(MIXABLE_DESIGN_SLUGS.has("aurora-site")).toBe(true);
  });

  it("returns null exactly when the chrome IS selectable", () => {
    expect(explainChromeRejection(haloHeader, "halo")).toBeNull();
    expect(explainChromeRejection(megaFooter, "aurora-site")).toBeNull();
    expect(explainChromeRejection(fableHeader, "fable")).toBeNull();
  });

  it.skipIf(!LOCKED_DESIGN)(
    "blames the DESIGN when a mixable Part meets a locked-theme design",
    () => {
      const r = explainChromeRejection(megaFooter, LOCKED_DESIGN!)!;
      expect(r.reason).toBe("design-not-mixable");
      // The regression this file exists for: no "undefined" design, and the
      // remedy is switching design — not picking another chrome.
      expect(r.message).not.toContain("undefined");
      expect(r.message).toContain('"mega-footer" is a mixable chrome');
      expect(r.message).toContain(`the active design "${LOCKED_DESIGN}"`);
      expect(r.message).toContain("Switch to a mixable design");
      // …and it must NOT assert the target is locked-theme. The same branch
      // catches Blank Canvas and every bespoke customer pack that simply never
      // declared itself, for whom "switch design" means "throw your design
      // away" — so the message names the pack-local route too.
      expect(r.message).not.toContain("is a locked-theme design");
      expect(r.message).toContain("declare it mixable");
      // A mixable DESIGN chrome on a locked design is the same refusal — it must
      // not be reported as "only renders on fable", which is false: it renders on
      // every mixable design.
      const d = explainChromeRejection(fableHeader, LOCKED_DESIGN!)!;
      expect(d.reason).toBe("design-not-mixable");
      expect(d.message).not.toContain("only renders on");
    },
  );

  it("blames the CHROME when it is locked to another design", () => {
    const r = explainChromeRejection(haloHeader, "aurora-site")!;
    expect(r.reason).toBe("locked-to-design");
    expect(r.message).toContain('only renders on the "halo" design');
    expect(r.message).toContain("(active design: aurora-site)");
    expect(r.message).toContain('Switch to "halo"');
  });

  it.skipIf(!LOCKED_DESIGN)(
    "offers 'pick a mixable chrome' only when the target actually accepts one",
    () => {
      // Mixable target: the alternative route is real, so it is offered.
      expect(explainChromeRejection(haloHeader, "aurora-site")!.message).toContain(
        "or pick a mixable chrome",
      );
      // NON-mixable target: a mixable pick would land in design-not-mixable —
      // "picking a different chrome will not help" — so offering it here is an
      // empty cure-set and the two branches contradict each other. The
      // locked-theme remedies must not send the caller there.
      const closed = explainChromeRejection(haloHeader, LOCKED_DESIGN!)!;
      expect(closed.reason).toBe("locked-to-design");
      expect(closed.message).not.toContain("pick a mixable chrome");
      expect(closed.message).toContain('Switch to "halo"');
      // Same rule for the design-less locked shape: the remedy switches to the
      // target's own pack instead of the impossible mixable route.
      const orphan = { key: "orphan-footer", label: "Orphan", kind: "footer", mixable: false } as const;
      expect(explainChromeRejection(orphan, "aurora-site")!.message).toContain(
        "Pick a mixable chrome",
      );
      const orphanClosed = explainChromeRejection(orphan, LOCKED_DESIGN!)!;
      expect(orphanClosed.reason).toBe("locked-standalone");
      expect(orphanClosed.message).not.toContain("mixable chrome");
      expect(orphanClosed.message).toContain("own pack");
      // The pack's own declaration gates this exactly like every other reader:
      // a target that opts IN gets the mixable route back.
      expect(
        explainChromeRejection(haloHeader, LOCKED_DESIGN!, { targetMixable: true })!.message,
      ).toContain("or pick a mixable chrome");
    },
  );

  it("prints 'none' — not a serialized null — when there is no target design", () => {
    // Pins the `?? "none"` fallback (a prior mutation pass showed it unpinned).
    const r = explainChromeRejection(haloHeader, null)!;
    expect(r.message).toContain("(active design: none)");
    expect(r.message).not.toContain("null");
  });

  it("says so when there is no design at all", () => {
    for (const target of [null, undefined]) {
      const r = explainChromeRejection(megaFooter, target)!;
      expect(r.reason).toBe("no-target-design");
      expect(r.message).not.toContain("undefined");
      expect(r.message).toContain("Choose a design first");
    }
    // A LOCKED chrome with no active design is still the chrome's own fault.
    expect(explainChromeRejection(haloHeader, null)!.reason).toBe("locked-to-design");
  });

  it("never prints 'undefined' for a chrome that owns no design", () => {
    // No shipped entry is both non-mixable and design-less, but ChromeMeta
    // allows it and it is the exact shape the old message mangled.
    const orphan = { key: "orphan-footer", label: "Orphan", kind: "footer", mixable: false } as const;
    const r = explainChromeRejection(orphan, "aurora-site")!;
    expect(r.reason).toBe("locked-standalone");
    expect(r.message).not.toContain("undefined");
    expect(r.message).toContain('"orphan-footer"');
  });

  it.skipIf(!LOCKED_DESIGN)(
    "names the target the caller's way (the composition validator says 'skin')",
    () => {
      const r = explainChromeRejection(megaFooter, LOCKED_DESIGN!, { targetNoun: "skin" })!;
      expect(r.message).toContain(`the skin "${LOCKED_DESIGN}"`);
      expect(r.message).not.toContain("active design");
    },
  );

  it("does not tell you to edit a pack you do not have", () => {
    // The composition validator does NOT return after flagging an unknown skin
    // (lib/compositions/spec.ts:109-115), so a composition authored elsewhere
    // reaches the explainer with a design this shop has never installed. The
    // "declare it mixable" remedy is impossible there — you cannot edit a pack
    // you lack — which would repeat the very defect this helper fixes.
    const r = explainChromeRejection(megaFooter, CUSTOM, { targetNoun: "skin" })!;
    expect(r.reason).toBe("target-not-registered");
    expect(r.message).toContain("is not a registered design on this shop");
    expect(r.message).toContain(`npx cartwright design install ${CUSTOM}`);
    expect(r.message).not.toContain("declare it mixable");
    expect(r.message).not.toContain("MIXABLE_DESIGN_SLUGS");
    // A REGISTERED but non-mixable design keeps the pack-local remedy
    // (secondary reinforcement of the "blames the DESIGN" case above, so this
    // leg only runs where such a design exists).
    if (LOCKED_DESIGN) {
      expect(explainChromeRejection(megaFooter, LOCKED_DESIGN)!.reason).toBe(
        "design-not-mixable",
      );
    }
  });

  it("threads the pack's own `mixable` to the same answer it explains", () => {
    // Pack opts IN → selectable → no rejection to explain.
    expect(explainChromeRejection(megaFooter, CUSTOM, { targetMixable: true })).toBeNull();
    // Pack opts OUT of a built-in mixable slug → the DESIGN is the constraint.
    const out = explainChromeRejection(megaFooter, "aurora-site", { targetMixable: false })!;
    expect(out.reason).toBe("design-not-mixable");
    expect(out.message).toContain('the active design "aurora-site"');
  });

  it("INVARIANT — agrees with isChromeSelectable and never leaks 'undefined'", () => {
    const targets: Array<string | null | undefined> = [
      ...DESIGN_OPTIONS.map((d) => d.slug),
      CUSTOM,
      null,
      undefined,
    ];
    let refusals = 0;
    for (const meta of CHROME_CATALOG) {
      for (const target of targets) {
        for (const targetMixable of [undefined, true, false] as const) {
          const selectable = isChromeSelectable(meta, target, targetMixable);
          const r = explainChromeRejection(meta, target, { targetMixable });
          expect(r === null, `${meta.key} on ${target} (mixable=${targetMixable})`).toBe(
            selectable,
          );
          if (r) {
            refusals++;
            // The whole point: no interpolated `undefined`, and every refusal
            // names the chrome that was asked for.
            expect(r.message, `${meta.key} on ${target}`).not.toContain("undefined");
            expect(r.message).toContain(`"${meta.key}"`);
          }
        }
      }
    }
    // Non-vacuity floor. NOT "a helper returning null everywhere would pass" —
    // the agreement assertion above catches that on the first refusal. What
    // this guards is narrower and real: that the loop body ran at all, i.e. the
    // catalogue and DESIGN_OPTIONS are both non-empty and the cross-product
    // reaches the refusing branches. Kept as a bare `> 0` on purpose: an
    // absolute count would be a second prune-sensitive fixture in a file that
    // already has several (a light scaffold prunes both lists).
    expect(refusals).toBeGreaterThan(0);
  });
});
