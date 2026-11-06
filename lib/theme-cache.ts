import type { DesignPack } from "@/designs";
import type { ChromeConfig } from "@/lib/builder/chrome-catalog";
import type { ExtendedTheme } from "@/lib/theme";

/**
 * The theme/design/chrome cache slots and their invalidator — a LEAF module.
 *
 * Every import here is `import type`, which TypeScript erases, so this file has
 * **no runtime dependencies at all**. That is the whole point.
 *
 * `invalidateThemeCache()` is a three-line cache bust, but it used to live in
 * `lib/theme.ts` — which imports `@/designs`, and `designs/index.ts` statically
 * imports 29 design packs. So every writer that merely wanted to bust the cache
 * after an update (`lib/tools/audit.ts`, `lib/tools/compose.ts`,
 * `lib/compositions/apply.ts`, `lib/verticals/apply.ts`,
 * `plugins/design-import`, `plugins/hoptify`, two admin action files) pulled the
 * entire design registry into its module graph to do it.
 *
 * `lib/theme.ts` re-exports `invalidateThemeCache`, so the documented plugin
 * contract ("lib/theme.ts STAYS CORE — ThemePalette/isValidHex/
 * invalidateThemeCache") is unchanged for anyone importing it from there.
 *
 * Keep this file free of value imports.
 */

type Slot<T> = { value: T; expiresAt: number } | null;

/**
 * Shared mutable slots. An object holder rather than three `let` exports:
 * ES module live-bindings are read-only for importers, so a plain
 * `export let` could not be reassigned from `lib/theme.ts`.
 */
export const themeCacheSlots: {
  theme: Slot<ExtendedTheme | null>;
  design: Slot<DesignPack | null>;
  chrome: Slot<ChromeConfig | null>;
} = { theme: null, design: null, chrome: null };

/** Drop every cached theme/design/chrome resolution (call after any write). */
export function invalidateThemeCache(): void {
  themeCacheSlots.theme = null;
  themeCacheSlots.design = null;
  themeCacheSlots.chrome = null;
}
