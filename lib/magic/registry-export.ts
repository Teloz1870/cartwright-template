import "server-only";

import { zodToJsonSchema } from "zod-to-json-schema";
import { SECTION_REGISTRY, type SectionKey } from "@/lib/builder/section-registry";

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

type SchemaArg = Parameters<typeof zodToJsonSchema>[0];

export type RegistryIndex = {
  $schema: string;
  name: string;
  homepage: string;
  schemaVersion: number;
  items: { name: string; type: string; title: string }[];
};

export function buildRegistryIndex(origin: string): RegistryIndex {
  return {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "cartwright",
    homepage: origin,
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    items: (Object.keys(SECTION_REGISTRY) as SectionKey[]).map((key) => ({
      name: key,
      type: "registry:block",
      title: SECTION_REGISTRY[key].label,
    })),
  };
}

export type RegistryItem = {
  $schema: string;
  name: string;
  type: string;
  title: string;
  schemaVersion: number;
  meta: { propsSchema: unknown; defaultProps: unknown };
  files?: { path: string; content: string; type: string }[];
};

/**
 * Build one shadcn registry-item. Always includes the prop JSON-Schema contract.
 * When `withSource` is true (componentRegistryShipsSource) a `files` array would
 * carry the MIT-headered TSX for curated self-contained atoms — left empty until
 * the build-time source-embed lands (so the route can flip on without breaking).
 */
export function buildRegistryItem(key: SectionKey, withSource = false): RegistryItem {
  const entry = SECTION_REGISTRY[key];
  const item: RegistryItem = {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name: key,
    type: "registry:block",
    title: entry.label,
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    meta: {
      propsSchema: zodToJsonSchema(entry.propsSchema as unknown as SchemaArg, key),
      defaultProps: entry.defaultProps,
    },
  };
  if (withSource) item.files = [];
  return item;
}

export function isExportableKey(key: string): key is SectionKey {
  return key in SECTION_REGISTRY;
}
