import { describe, it, expect } from "vitest";
import { parsePageLayout } from "@/lib/builder/section-schema";
import { resolvePageLayout } from "@/lib/builder/page-layout";
import { SECTION_REGISTRY } from "@/lib/builder/section-registry";

/**
 * Visual Builder — page section-tree validering + resolve.
 *
 * `parsePageLayout()` er den sikkerheds-kritiske gate: et godkendt tree må KUN
 * indeholde whitelisted section-keys, og hver sektions `props` valideres mod
 * dens egen Zod-schema (ingen vilkårlige felter). Mirror af parseLayoutJson.
 *
 * `resolvePageLayout()` er ren render-forberedelse: filtrer disabled væk, bevar
 * array-rækkefølge, udfyld props (eksplicit ?? defaultProps).
 */

const validHeroProps = {
  headline: "Velkommen",
  tagline: "Vi bygger ting.",
  ctaLabel: "Kom i gang",
  ctaHref: "/kontakt",
};

function tree(sections: unknown[]): string {
  return JSON.stringify({ sections });
}

describe("parsePageLayout", () => {
  it("returnerer null for null/undefined/empty", () => {
    expect(parsePageLayout(null)).toBeNull();
    expect(parsePageLayout(undefined)).toBeNull();
    expect(parsePageLayout("")).toBeNull();
  });

  it("returnerer null for invalid JSON", () => {
    expect(parsePageLayout("not json")).toBeNull();
    expect(parsePageLayout("{nope}")).toBeNull();
  });

  it("returnerer null hvis sections er tom array", () => {
    expect(parsePageLayout(tree([]))).toBeNull();
  });

  it("parser et gyldigt tree og defaulter enabled til true", () => {
    const raw = tree([
      { id: "a", key: "hero", props: validHeroProps },
      { id: "b", key: "richText", props: { body: "Hej verden." } },
    ]);
    const parsed = parsePageLayout(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.sections).toHaveLength(2);
    expect(parsed?.sections[0].enabled).toBe(true);
    expect(parsed?.sections[0].key).toBe("hero");
  });

  it("afviser ukendte section-keys (whitelist)", () => {
    const raw = tree([
      { id: "a", key: "hero", props: validHeroProps },
      { id: "x", key: "arbitraryScript", props: {} },
    ]);
    expect(parsePageLayout(raw)).toBeNull();
  });

  it("afviser duplikerede node-ids", () => {
    const raw = tree([
      { id: "dup", key: "hero", props: validHeroProps },
      { id: "dup", key: "richText", props: { body: "x x x" } },
    ]);
    expect(parsePageLayout(raw)).toBeNull();
  });

  it("afviser en sektion med invalide props (manglende required felt)", () => {
    const raw = tree([
      { id: "a", key: "hero", props: { tagline: "mangler headline" } },
    ]);
    expect(parsePageLayout(raw)).toBeNull();
  });

  it("afviser ukendte prop-felter (strict schema → ingen injection)", () => {
    const raw = tree([
      {
        id: "a",
        key: "hero",
        props: { ...validHeroProps, onClick: "alert(1)" },
      },
    ]);
    expect(parsePageLayout(raw)).toBeNull();
  });

  it("tillader en node uden props (valideres mod defaultProps)", () => {
    const raw = tree([{ id: "a", key: "hero" }]);
    const parsed = parsePageLayout(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.sections[0].props).toBeUndefined();
  });
});

describe("resolvePageLayout", () => {
  it("returnerer [] for null/invalid (render falder tilbage til body)", () => {
    expect(resolvePageLayout(null)).toEqual([]);
    expect(resolvePageLayout("not json")).toEqual([]);
    expect(resolvePageLayout(tree([{ id: "x", key: "bogus" }]))).toEqual([]);
  });

  it("filtrerer disabled sektioner væk og bevarer array-rækkefølge", () => {
    const raw = tree([
      { id: "c", key: "ctaFooter", enabled: true, props: { title: "T", ctaLabel: "Go", ctaHref: "/x" } },
      { id: "a", key: "hero", enabled: false, props: validHeroProps },
      { id: "b", key: "richText", enabled: true, props: { body: "Brødtekst her." } },
    ]);
    const resolved = resolvePageLayout(raw);
    expect(resolved.map((s) => s.id)).toEqual(["c", "b"]);
  });

  it("udfylder defaultProps når props udelades", () => {
    const raw = tree([{ id: "a", key: "hero" }]);
    const resolved = resolvePageLayout(raw);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].props).toEqual(SECTION_REGISTRY.hero.defaultProps);
  });

  it("bruger eksplicitte props når de er sat", () => {
    const raw = tree([{ id: "a", key: "hero", props: validHeroProps }]);
    const resolved = resolvePageLayout(raw);
    expect(resolved[0].props).toEqual(validHeroProps);
  });
});

describe("SECTION_REGISTRY", () => {
  it("hver entrys defaultProps validerer mod dens egen propsSchema", () => {
    for (const [key, entry] of Object.entries(SECTION_REGISTRY)) {
      const result = entry.propsSchema.safeParse(entry.defaultProps);
      expect(result.success, `defaultProps for '${key}' should be valid`).toBe(true);
    }
  });
});
