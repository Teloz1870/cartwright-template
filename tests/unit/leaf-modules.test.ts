import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * Leaf modules must stay leaves.
 *
 * `lib/theme.ts` imports `@/designs`, and `designs/index.ts` statically imports
 * 29 design packs (~1.4 MB). `ALL_DESIGNS` references every one, so tree-shaking
 * cannot drop them — they count as used. Anything importing `lib/theme` pays for
 * all 29, including `app/[locale]/layout.tsx`, the storefront root layout on
 * EVERY page view.
 *
 * Two trivial helpers used to live in that file:
 *   - `isValidHex` — a two-line regex
 *   - `invalidateThemeCache` — a three-line cache bust
 *
 * Eight writers imported the second one purely to drop the cache after a write,
 * and a plugin imported the first purely to validate a colour string. Both
 * dragged the whole registry in behind them. Measured on the two suites that
 * `CLAUDE.md` listed as "known flake under machine load":
 *
 *   audit-revert    2.58 s → 284 ms
 *   design-import   2.00 s → 240 ms
 *
 * They were never randomly flaky. They were ~2 s of module loading against a
 * 5 s vitest timeout, so a busy machine tipped them over.
 *
 * These assertions keep the leaves leaves. The last one is the real proof:
 * importing the cache module must not load `@/designs` at all.
 */

const ROOT = join(__dirname, "..", "..");

/** Value imports only — `import type` is erased by TypeScript and costs nothing. */
function valueImports(relPath: string): string[] {
  const text = readFileSync(join(ROOT, relPath), "utf8");
  return [...text.matchAll(/^\s*import\s+(?!type\b)([^;]*?)from\s+["']([^"']+)["']/gm)]
    .filter((m) => !/^\s*\{\s*type\s/.test(m[1]) || /,/.test(m[1]))
    .map((m) => m[2]);
}

describe("lib/color.ts — pure leaf", () => {
  it("has no value imports at all", () => {
    expect(valueImports("lib/color.ts")).toEqual([]);
  });

  it("is not server-only (usable from client code, plugins, scripts)", () => {
    // Match the import statement, not the word — the file's own docstring
    // explains why it is not server-only.
    expect(readFileSync(join(ROOT, "lib/color.ts"), "utf8")).not.toMatch(
      /^\s*import\s+["']server-only["']/m,
    );
  });
});

describe("lib/theme-cache.ts — pure leaf", () => {
  it("has no value imports at all (every import must be `import type`)", () => {
    expect(valueImports("lib/theme-cache.ts")).toEqual([]);
  });

  it("importing it does NOT load the design registry", async () => {
    // The load-bearing assertion. `@/designs` statically imports 29 packs, so a
    // single accidental value import here would silently restore the cost for
    // all eight cache-busting writers. Vitest evaluates a mock factory lazily,
    // on first import of the specifier, so the flag is a direct probe.
    const loaded = { value: false };
    vi.doMock("@/designs", () => {
      loaded.value = true;
      return { getDesign: () => null, inferDesignFromIndustry: () => null, ALL_DESIGNS: [] };
    });

    vi.resetModules();
    const mod = await import("@/lib/theme-cache");

    expect(typeof mod.invalidateThemeCache).toBe("function");
    expect(loaded.value, "@/designs was pulled in by importing lib/theme-cache").toBe(false);

    vi.doUnmock("@/designs");
    vi.resetModules();
  });

  it("the invalidator actually clears every slot", () => {
    // Cheap, but without it the module could export a no-op and every
    // structural assertion above would still pass.
    const now = Date.now();
    return import("@/lib/theme-cache").then(({ themeCacheSlots, invalidateThemeCache }) => {
      themeCacheSlots.theme = { value: null, expiresAt: now + 1000 };
      themeCacheSlots.design = { value: null, expiresAt: now + 1000 };
      themeCacheSlots.chrome = { value: null, expiresAt: now + 1000 };

      invalidateThemeCache();

      expect(themeCacheSlots.theme).toBeNull();
      expect(themeCacheSlots.design).toBeNull();
      expect(themeCacheSlots.chrome).toBeNull();
    });
  });
});

describe("lib/theme.ts — the documented plugin contract still holds", () => {
  it("re-exports isValidHex and invalidateThemeCache", async () => {
    // plugins/design-import/manifest.ts pins this: "lib/theme.ts STAYS CORE —
    // ThemePalette/isValidHex/invalidateThemeCache". Moving the implementations
    // to leaves must not change what that module offers.
    //
    // `@/designs` is stubbed here for a telling reason: without it this single
    // assertion took **5005 ms and timed out**, because importing lib/theme
    // still loads all 29 design packs. The re-export does not depend on the
    // registry, so stubbing it tests the contract honestly — and the fact that
    // the stub is NEEDED is the evidence for the upstream fix this PR does not
    // attempt (designs/index.ts should load packs dynamically).
    vi.resetModules();
    vi.doMock("@/designs", () => ({
      getDesign: () => null,
      inferDesignFromIndustry: () => null,
      ALL_DESIGNS: [],
    }));

    const theme = await import("@/lib/theme");
    expect(typeof theme.isValidHex).toBe("function");
    expect(typeof theme.invalidateThemeCache).toBe("function");
    expect(theme.isValidHex("#abc")).toBe(true);
    expect(theme.isValidHex("nope")).toBe(false);

    vi.doUnmock("@/designs");
    vi.resetModules();
  });
});
