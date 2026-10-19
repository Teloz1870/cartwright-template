import "server-only";

import { withAudit, type AuditActor } from "@/lib/audit";
import { GENOME_FIELDS, isGenomeFieldKey, type GenomeFieldKey } from "./fields";
import { mutateGenome, readGenomeJson } from "./store";

/**
 * Delt apply-core for genome-felt-overrides — brugt af BÅDE admin-server-action
 * (/admin/genome) OG AI-tool'et (genome.set), så allowlist-gate + schema-
 * validering + audit + cache-invalidering aldrig kan divergere. Spejler
 * lib/feature-flags/apply.ts og lib/three/apply.ts.
 *
 * value=null = nulstil override (slet key'en, så bloben kun rummer reelle
 * afvigelser). En evt. resolved-cache bevares som fallback.
 */

export type ApplyFieldResult =
  | { ok: true; key: GenomeFieldKey; value: string | null }
  | { ok: false; error: string };

export async function applyFieldOverride(
  key: string,
  value: string | null,
  actor: AuditActor,
): Promise<ApplyFieldResult> {
  if (!isGenomeFieldKey(key)) {
    return { ok: false, error: `'${key}' er ikke et genome-felt.` };
  }
  const field = GENOME_FIELDS[key];

  if (value !== null) {
    const p = field.schema.safeParse(value);
    if (!p.success) {
      const msg = p.error.issues[0]?.message ?? "ugyldig værdi";
      return { ok: false, error: `Ugyldig værdi for '${field.label}': ${msg}` };
    }
  }

  try {
    await withAudit(
      {
        actor,
        tool: "genome.set",
        args: { key, reset: value === null },
        before: readGenomeJson,
      },
      async () => {
        await mutateGenome((cur) => {
          const overrides = { ...(cur.overrides ?? {}) };
          if (value === null) delete overrides[key];
          else overrides[key] = value;
          return { ...cur, overrides };
        });
      },
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Kunne ikke gemme override.",
    };
  }

  return { ok: true, key, value };
}
