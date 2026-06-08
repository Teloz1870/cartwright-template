import { describe, expect, it } from "vitest";

import {
  buildRegistryIndex,
  buildRegistryItem,
  isExportableKey,
  REGISTRY_SCHEMA_VERSION,
} from "@/lib/magic/registry-export";
import { SECTION_REGISTRY } from "@/lib/builder/section-registry";

/**
 * Magic Builder — shadcn registry export. Pins the metadata-first contract:
 * every catalog section is listed with its prop JSON-Schema, and source files
 * are only present behind the explicit opt-in.
 */
describe("registry export", () => {
  it("indexes every section in the catalog", () => {
    const index = buildRegistryIndex("https://shop.example");
    const keys = Object.keys(SECTION_REGISTRY);
    expect(index.items).toHaveLength(keys.length);
    expect(index.items.map((i) => i.name).sort()).toEqual(keys.sort());
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
});
