import "server-only";

import { zodInputJsonSchema } from "@/lib/zod-json-schema";
import { SECTION_REGISTRY, type SectionKey } from "@/lib/builder/section-registry";
import { REGISTRY_SOURCE_MAP } from "@/lib/magic/registry-source";
import { SVG_ITEMS } from "@/components/svg-items";

/**
 * Magic Builder — shadcn-compatible component registry export (metadata-first).
 *
 * The registry ALWAYS serves the JSON-Schema CONTRACT for every catalog section
 * (what props each section accepts) so external AI agents / IDEs can discover and
 * target Cartwright sections. This is the doctrine-clean, genuinely-useful
 * artifact (data, not code).
 *
 * Shipping the actual installable TSX source (so `npx shadcn add` pulls real
 * components) is a SEPARATE opt-in (componentRegistryShipsSource) and only for a
 * curated, MIT-licensed, fully self-contained subset — wired in the route but the
 * source-embedding mechanism is a follow-up, so source files are omitted for now.
 */

export const REGISTRY_SCHEMA_VERSION = 1;

export type RegistryIndex = {
  $schema: string;
  name: string;
  homepage: string;
  schemaVersion: number;
  items: { name: string; type: string; title: string }[];
};

/** Registry namespace for the SVG item library (components/svg-items). */
export const SVG_REGISTRY_PREFIX = "svg-";

export function buildRegistryIndex(origin: string): RegistryIndex {
  return {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "cartwright",
    homepage: origin,
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    items: [
      ...(Object.keys(SECTION_REGISTRY) as SectionKey[]).map((key) => ({
        name: key,
        type: "registry:block",
        title: SECTION_REGISTRY[key].label,
      })),
      // SVG item library — plain installable component files (no prop contract
      // beyond `className`), served under the `svg-` namespace.
      ...SVG_ITEMS.map((item) => ({
        name: `${SVG_REGISTRY_PREFIX}${item.slug}`,
        type: "registry:component",
        title: item.name,
      })),
    ],
  };
}

export type RegistryItem = {
  $schema: string;
  name: string;
  type: string;
  title: string;
  description?: string;
  schemaVersion: number;
  meta: { propsSchema: unknown; defaultProps: unknown };
  files?: { path: string; content: string; type: string }[];
  registryDependencies?: string[];
};

/**
 * Build one shadcn registry-item. Always includes the prop JSON-Schema contract.
 * When `withSource` is true (componentRegistryShipsSource), the actual MIT-headered
 * TSX for the curated self-contained subset is attached as `files[]` from the
 * build-time `REGISTRY_SOURCE_MAP` (scripts/build-registry-source.ts) — atoms not
 * in the curated allowlist serve schema only (empty `files`).
 */
export function buildRegistryItem(key: SectionKey, withSource = false): RegistryItem {
  const entry = SECTION_REGISTRY[key];
  const item: RegistryItem = {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name: key,
    type: "registry:block",
    title: entry.label,
    description: entry.label,
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    meta: {
      propsSchema: zodInputJsonSchema(entry.propsSchema),
      defaultProps: entry.defaultProps,
    },
  };
  if (withSource) {
    const src = REGISTRY_SOURCE_MAP[key];
    item.files = src?.files ?? [];
    if (src?.registryDependencies?.length) {
      item.registryDependencies = src.registryDependencies;
    }
  }
  return item;
}

export function isExportableKey(key: string): key is SectionKey {
  return key in SECTION_REGISTRY;
}

/* ── SVG item library ─────────────────────────────────────────────────────
 * The 21 hand-authored marks/dividers/illustrations in components/svg-items
 * (12 static + 9 CSS-animated, reduced-motion safe)
 * are plain presentational components (single optional `className` prop) —
 * no zod section contract, so they get a hand-written minimal props schema.
 * Source files ship behind the same componentRegistryShipsSource opt-in,
 * from the same build-time REGISTRY_SOURCE_MAP (one self-contained file per
 * item, keyed `svg-<slug>`).
 */

const SVG_ITEM_PROPS_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    className: {
      type: "string",
      description: "Optional class applied to the root <svg> element.",
    },
  },
  additionalProperties: false,
} as const;

export function isExportableSvgItemKey(key: string): boolean {
  if (!key.startsWith(SVG_REGISTRY_PREFIX)) return false;
  const slug = key.slice(SVG_REGISTRY_PREFIX.length);
  return SVG_ITEMS.some((item) => item.slug === slug);
}

export function buildSvgItemRegistryItem(key: string, withSource = false): RegistryItem | null {
  const slug = key.startsWith(SVG_REGISTRY_PREFIX) ? key.slice(SVG_REGISTRY_PREFIX.length) : key;
  const entry = SVG_ITEMS.find((item) => item.slug === slug);
  if (!entry) return null;
  const item: RegistryItem = {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name: `${SVG_REGISTRY_PREFIX}${entry.slug}`,
    type: "registry:component",
    title: entry.name,
    description: entry.description,
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    meta: { propsSchema: SVG_ITEM_PROPS_SCHEMA, defaultProps: {} },
  };
  if (withSource) {
    const src = REGISTRY_SOURCE_MAP[item.name];
    item.files = src?.files ?? [];
    if (src?.registryDependencies?.length) {
      item.registryDependencies = src.registryDependencies;
    }
  }
  return item;
}
