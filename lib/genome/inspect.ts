import "server-only";

import { GENOME_FIELDS, GENOME_FIELD_KEYS, type GenomeFieldKey } from "./fields";
import { activeDeps, depsKey, loadGenome } from "./store";
import { readField } from "./read";
import type { GenomeDeps } from "./types";

/**
 * Læse-snapshot af hele genomet — delt af admin-dashboardet (/admin/genome, A4)
 * og AI-tool'et (genome.get). Ren read: kalder readField (ingen LLM) + loadGenome.
 */

export type FieldStatus = "anchor" | "override" | "resolved" | "stale";

export type GenomeFieldSnapshot = {
  key: GenomeFieldKey;
  label: string;
  lock: string;
  dependsOn: readonly string[];
  anchor: string;
  override: string | null;
  resolved: string | null;
  /** Hvad readField faktisk returnerer lige nu (det rendrede). */
  current: string;
  status: FieldStatus;
};

export type GenomeSnapshot = {
  deps: GenomeDeps;
  fields: GenomeFieldSnapshot[];
};

export async function inspectGenome(): Promise<GenomeSnapshot> {
  const genome = await loadGenome();
  const deps = activeDeps(genome);
  const fields: GenomeFieldSnapshot[] = [];

  for (const key of GENOME_FIELD_KEYS) {
    const field = GENOME_FIELDS[key];
    const override = genome.overrides?.[key] ?? null;
    const cached = genome.resolved?.[key];
    const isFresh = cached ? cached.deps === depsKey(field, deps) : false;
    const current = await readField(key);

    let status: FieldStatus = "anchor";
    if (override !== null) status = "override";
    else if (isFresh) status = "resolved";
    else if (cached) status = "stale";

    fields.push({
      key,
      label: field.label,
      lock: field.lock,
      dependsOn: field.dependsOn,
      anchor: field.anchor,
      override,
      resolved: cached?.value ?? null,
      current,
      status,
    });
  }

  return { deps, fields };
}
