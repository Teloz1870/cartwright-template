import { describe, expect, it } from "vitest";

import {
  buildRegistryIndex,
  buildRegistryItem,
  buildSvgItemRegistryItem,
  isExportableKey,
  isExportableSvgItemKey,
  REGISTRY_SCHEMA_VERSION,
  SVG_REGISTRY_PREFIX,
} from "@/lib/magic/registry-export";
import { SECTION_REGISTRY } from "@/lib/builder/section-registry";
import { SVG_ITEMS } from "@/components/svg-items";

/**
 * Magic Builder — shadcn registry export. Pins the metadata-first contract:
 * every catalog section is listed with its prop JSON-Schema, and source files
 * are only present behind the explicit opt-in.
 */
describe("registry export", () => {
  it("indexes every section in the catalog plus the svg-item library", () => {
    const index = buildRegistryIndex("https://shop.example");
    const sectionKeys = Object.keys(SECTION_REGISTRY);
    const svgKeys = SVG_ITEMS.map((i) => `${SVG_REGISTRY_PREFIX}${i.slug}`);
    expect(index.items).toHaveLength(sectionKeys.length + svgKeys.length);
    expect(index.items.map((i) => i.name).sort()).toEqual([...sectionKeys, ...svgKeys].sort());
    // Sections stay blocks; svg items are plain installable components.
    for (const key of svgKeys) {
      expect(index.items.find((i) => i.name === key)?.type).toBe("registry:component");
    }
    expect(index.name).toBe("cartwright");
    expect(index.schemaVersion).toBe(REGISTRY_SCHEMA_VERSION);
  });

  it("emits a JSON-Schema contract + defaults for a section (no source by default)", () => {
    const item = buildRegistryItem("hero");
    expect(item.name).toBe("hero");
    expect(item.type).toBe("registry:block");
    expect(item.meta.propsSchema).toBeTruthy();
    expect(item.meta.defaultProps).toBeTruthy();
    expect(item.files).toBeUndefined(); // schema-only unless ships-source opt-in
  });

  it("ships real TSX source for curated atoms when source-shipping is requested", () => {
    // testimonials is in the curated allowlist → real files with content.
    const item = buildRegistryItem("testimonials", true);
    expect(item.files && item.files.length).toBeGreaterThan(0);
    expect(item.files?.[0].content).toMatch(/export function|import/);
    expect(item.files?.[0].path).toMatch(/^components\//);
  });

  it("serves schema-only (empty files) for non-curated atoms even with source on", () => {
    // hero is NOT in the curated allowlist.
    expect(buildRegistryItem("hero", true).files).toEqual([]);
  });

  it("guards unknown keys", () => {
    expect(isExportableKey("hero")).toBe(true);
    expect(isExportableKey("definitely-not-a-section")).toBe(false);
  });

  it("serves every svg item with a minimal className contract (no source by default)", () => {
    for (const entry of SVG_ITEMS) {
      const key = `${SVG_REGISTRY_PREFIX}${entry.slug}`;
      expect(isExportableSvgItemKey(key)).toBe(true);
      const item = buildSvgItemRegistryItem(key);
      expect(item).not.toBeNull();
      expect(item?.type).toBe("registry:component");
      expect(item?.title).toBe(entry.name);
      expect(item?.meta.defaultProps).toEqual({});
      expect(item?.files).toBeUndefined(); // schema-only unless ships-source opt-in
    }
  });

  it("ships the self-contained TSX for svg items when source-shipping is requested", () => {
    const item = buildSvgItemRegistryItem("svg-orbit-mark", true);
    expect(item?.files).toHaveLength(1);
    expect(item?.files?.[0].path).toBe("components/cartwright/svg-items/OrbitMark.tsx");
    expect(item?.files?.[0].content).toMatch(/export function OrbitMark/);
    // Self-containment: the shipped file may only use type-only react imports.
    const imports = (item?.files?.[0].content.match(/^import .*$/gm) ?? []).filter(
      (line) => !line.startsWith("import type"),
    );
    expect(imports).toEqual([]);
  });

  it("guards unknown svg-item keys", () => {
    expect(isExportableSvgItemKey("svg-not-a-real-item")).toBe(false);
    expect(isExportableSvgItemKey("orbit-mark")).toBe(false); // prefix required
    expect(buildSvgItemRegistryItem("svg-not-a-real-item")).toBeNull();
  });
});
