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
