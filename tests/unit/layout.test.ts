import { describe, it, expect } from "vitest";
import { resolveSectionOrder, type SectionRegistry } from "@/designs/layout-types";
import { parseLayoutJson } from "@/lib/layout";

/**
 * Track 1A (v0.16.0): runtime section-layout config.
 *
 * `resolveSectionOrder(registry, config)` er ren forretningslogik:
 *  - null config → default-order fra registry (sorteret efter `order`)
 *  - filtrerer ukendte keys væk
 *  - bevarer `required: true`-sektioner (kan ikke skjules)
 *  - respekterer caller-defineret order + enabled
 *
 * `parseLayoutJson()` er strukturel validering (null-on-fail), mirror af
 * `parseThemeJson()` i lib/theme.ts.
 */

const studioLikeRegistry: SectionRegistry = {
  hero: { order: 10, enabledByDefault: true, required: true },
  valueProps: { order: 20, enabledByDefault: true },
  featureGrid: { order: 30, enabledByDefault: true },
  howItWorks: { order: 40, enabledByDefault: true },
  stackGrid: { order: 50, enabledByDefault: true },
  ctaFooter: { order: 60, enabledByDefault: true, required: true },
};

describe("resolveSectionOrder", () => {
  it("null config → default-order alle enabled fra registry", () => {
    const result = resolveSectionOrder(studioLikeRegistry, null);
    expect(result).toEqual([
      "hero",
      "valueProps",
      "featureGrid",
      "howItWorks",
      "stackGrid",
      "ctaFooter",
    ]);
  });

  it("null config respekterer enabledByDefault=false", () => {
    const registry: SectionRegistry = {
      ...studioLikeRegistry,
      stackGrid: { order: 50, enabledByDefault: false },
    };
    const result = resolveSectionOrder(registry, null);
    expect(result).not.toContain("stackGrid");
    expect(result).toContain("hero");
    expect(result).toContain("ctaFooter");
  });

  it("caller kan re-ordere sektioner", () => {
    const config = {
      sections: [
        { key: "ctaFooter", enabled: true },
        { key: "hero", enabled: true },
        { key: "featureGrid", enabled: true },
      ],
    };
    const result = resolveSectionOrder(studioLikeRegistry, config);
    expect(result).toEqual(["ctaFooter", "hero", "featureGrid"]);
  });

  it("kan skjule en non-required sektion", () => {
    const config = {
      sections: [
        { key: "hero", enabled: true },
        { key: "valueProps", enabled: false },
        { key: "ctaFooter", enabled: true },
      ],
    };
    const result = resolveSectionOrder(studioLikeRegistry, config);
    expect(result).not.toContain("valueProps");
    expect(result).toContain("hero");
    expect(result).toContain("ctaFooter");
  });

  it("kan IKKE skjule en required sektion — hero forbliver", () => {
    const config = {
      sections: [
        { key: "hero", enabled: false },
        { key: "valueProps", enabled: true },
        { key: "ctaFooter", enabled: true },
      ],
    };
    const result = resolveSectionOrder(studioLikeRegistry, config);
    expect(result).toContain("hero");
    expect(result).toContain("ctaFooter");
  });

  it("required sektioner re-tilføjes hvis de mangler i config", () => {
    const config = {
      sections: [
        { key: "valueProps", enabled: true },
        { key: "featureGrid", enabled: true },
      ],
    };
    const result = resolveSectionOrder(studioLikeRegistry, config);
    expect(result).toContain("hero");
    expect(result).toContain("ctaFooter");
  });

  it("filtrerer ukendte keys væk", () => {
    const config = {
      sections: [
        { key: "hero", enabled: true },
        { key: "doesNotExist", enabled: true },
        { key: "alsoNotReal", enabled: true },
        { key: "ctaFooter", enabled: true },
      ],
    };
    const result = resolveSectionOrder(studioLikeRegistry, config);
    expect(result).not.toContain("doesNotExist");
    expect(result).not.toContain("alsoNotReal");
    expect(result).toEqual(["hero", "ctaFooter"]);
  });

  it("er pure — muterer ikke registry eller config", () => {
    const registry: SectionRegistry = JSON.parse(JSON.stringify(studioLikeRegistry));
    const config = {
      sections: [{ key: "valueProps", enabled: true }],
    };
    const registrySnapshot = JSON.parse(JSON.stringify(registry));
    const configSnapshot = JSON.parse(JSON.stringify(config));
    resolveSectionOrder(registry, config);
    expect(registry).toEqual(registrySnapshot);
    expect(config).toEqual(configSnapshot);
  });
});

describe("parseLayoutJson", () => {
  it("returnerer null for null/undefined/empty", () => {
    expect(parseLayoutJson(null)).toBeNull();
    expect(parseLayoutJson(undefined)).toBeNull();
    expect(parseLayoutJson("")).toBeNull();
  });

  it("returnerer null for invalid JSON", () => {
    expect(parseLayoutJson("not json")).toBeNull();
    expect(parseLayoutJson("{not valid}")).toBeNull();
  });

  it("returnerer null hvis sections er tom array", () => {
    expect(parseLayoutJson(JSON.stringify({ sections: [] }))).toBeNull();
  });

  it("returnerer null hvis sections mangler", () => {
    expect(parseLayoutJson(JSON.stringify({}))).toBeNull();
  });

  it("returnerer null hvis en section mangler key", () => {
    const raw = JSON.stringify({
      sections: [{ enabled: true }, { key: "hero", enabled: true }],
    });
    expect(parseLayoutJson(raw)).toBeNull();
  });

  it("parser valid config med eksplicit enabled", () => {
    const raw = JSON.stringify({
      sections: [
        { key: "hero", enabled: true },
        { key: "valueProps", enabled: false },
      ],
    });
    const parsed = parseLayoutJson(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.sections).toHaveLength(2);
    expect(parsed?.sections[0]).toEqual({ key: "hero", enabled: true });
    expect(parsed?.sections[1]).toEqual({ key: "valueProps", enabled: false });
  });

  it("defaulter enabled til true når feltet mangler", () => {
    const raw = JSON.stringify({
      sections: [{ key: "hero" }, { key: "ctaFooter" }],
    });
    const parsed = parseLayoutJson(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.sections[0].enabled).toBe(true);
    expect(parsed?.sections[1].enabled).toBe(true);
  });

  it("afviser duplikerede keys", () => {
    const raw = JSON.stringify({
      sections: [
        { key: "hero", enabled: true },
        { key: "hero", enabled: false },
      ],
    });
    expect(parseLayoutJson(raw)).toBeNull();
  });
});
