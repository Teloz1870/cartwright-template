import "server-only";

import { GENOME_FIELDS, type GenomeFieldKey } from "./fields";
import { activeDeps, depsKey, loadGenome } from "./store";

/**
 * READ-stien — kaldes fra render (server components). Returnerer
 * `override ?? resolved-cache (for aktuelle deps) ?? anker`. KALDER ALDRIG en
 * LLM og muterer aldrig: render forbliver hurtig, gratis og fail-soft. Med
 * flaget off (eller tom cache) returneres ankeret → byte-identisk med før-genome.
 *
 * Hvert lag schema-valideres, så en korrupt override/cache aldrig kan rendere
 * skrald — den degraderer bare til næste lag.
 */
export async function readField(key: GenomeFieldKey): Promise<string> {
  const field = GENOME_FIELDS[key];
  const genome = await loadGenome();

  // 1) eksplicit override vinder.
  const ov = genome.overrides?.[key];
  if (ov !== undefined) {
    const p = field.schema.safeParse(ov);
    if (p.success) return p.data;
  }

  // 2) resolved cache gyldig for de aktuelle deps.
  const deps = activeDeps(genome);
  const cached = genome.resolved?.[key];
  if (cached && cached.deps === depsKey(field, deps)) {
    const p = field.schema.safeParse(cached.value);
    if (p.success) return p.data;
  }

  // 3) anker (render kalder aldrig en LLM).
  return field.anchor;
}

/** Entity-copy kinds + fields that may be voiced per-entity. */
export type EntityCopyKind = "product" | "category";
export type EntityCopyField = "description";

/** Stable key for a per-entity override (`"<kind>:<id>:<field>"`). */
export function entityCopyKey(kind: EntityCopyKind, id: string, field: EntityCopyField): string {
  return `${kind}:${id}:${field}`;
}

/**
 * READ a per-entity copy override (voiced product/category copy). Returns the
 * admin/AI-set override when present + non-empty, else `fallback` (the entity's
 * own copy). Never calls an LLM. Callers gate on features.genomeEntityCopy, so
 * with the flag off this is never invoked and PDP/PLP render byte-identical.
 */
export async function readEntityCopy(
  kind: EntityCopyKind,
  id: string,
  field: EntityCopyField,
  fallback: string,
): Promise<string> {
  const genome = await loadGenome();
  const ov = genome.entityOverrides?.[entityCopyKey(kind, id, field)];
  return typeof ov === "string" && ov.trim() ? ov : fallback;
}
