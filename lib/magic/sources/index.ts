import "server-only";

import type { SourceAdapter } from "@/lib/magic/types";
import type { MagicSource } from "@/lib/magic/plan-schema";
import { generateCatalogSection } from "./catalog";
import { generateVibeSection } from "./v0";

/**
 * Magic Builder — source registry. Maps a plan node's `source` to its adapter.
 * Every adapter returns the identical normalized shape, so Cartwright is never
 * locked to one generator. "21st-dev" is deliberately ABSENT (licensing-blocked,
 * see the Magic Builder plan, Phase 5).
 */
export const SOURCE_ADAPTERS: Record<MagicSource, SourceAdapter> = {
  catalog: generateCatalogSection,
  v0: generateVibeSection,
};
