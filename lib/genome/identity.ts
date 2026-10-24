import "server-only";

import { withAudit, type AuditActor } from "@/lib/audit";
import { GENOME_FIELDS, GENOME_FIELD_KEYS, type GenomeFieldKey } from "./fields";
import { mutateGenome, readGenomeJson } from "./store";
import { resolveField, type ResolveResult } from "./resolve";
import type { GenomeAnchorKey } from "./types";

/**
 * Identity-ankrene + dependency-grafen — det der gør "selv-harmoniserende
 * rebrand" til en operation. Ankre lever i brand.config.identity (defaults) og
 * kan overrides uden redeploy via genomeJson.identity. At ændre ét anker
 * invaliderer (via deps-mismatch i lib/genome/store.ts:depsKey) hvert resolvable
 * felt der dependsOn det; reharmonizeAll re-resolver dem så det rendrede skifter.
 */

/** Tilladte enum-værdier pr. anker (vibe er fri-form). Mirror af brand.config.identity. */
export const IDENTITY_OPTIONS = {
  tone: ["professional", "playful", "luxurious", "technical", "warm"],
  audience: ["general", "business", "consumer", "enthusiast"],
  formality: ["formal", "balanced", "casual"],
} as const satisfies Partial<Record<GenomeAnchorKey, readonly string[]>>;

export type SetIdentityResult =
  | { ok: true; key: GenomeAnchorKey; value: string }
  | { ok: false; error: string };

export function validateIdentity(key: string, value: string): string | null {
  if (key === "tone" || key === "audience" || key === "formality") {
    const allowed = IDENTITY_OPTIONS[key] as readonly string[];
    if (!allowed.includes(value)) {
      return `'${value}' er ikke en gyldig ${key} (vælg: ${allowed.join(", ")}).`;
    }
    return null;
  }
  if (key === "vibe") {
    const v = value.trim();
    if (v.length < 2 || v.length > 40) return "vibe skal være 2-40 tegn.";
    return null;
  }
  return `Ukendt identity-anker '${key}'.`;
}

export async function applyIdentityAnchor(
  key: string,
  value: string,
  actor: AuditActor,
): Promise<SetIdentityResult> {
  const error = validateIdentity(key, value);
  if (error) return { ok: false, error };
  const anchorKey = key as GenomeAnchorKey;
  const clean = anchorKey === "vibe" ? value.trim() : value;

  try {
    await withAudit(
      {
        actor,
        tool: "genome.identity",
        args: { key: anchorKey, value: clean },
        before: readGenomeJson,
      },
      async () => {
        await mutateGenome((cur) => ({
          ...cur,
          identity: { ...(cur.identity ?? {}), [anchorKey]: clean },
        }));
      },
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Kunne ikke gemme identity-anker.",
    };
  }

  return { ok: true, key: anchorKey, value: clean };
}

export type ReharmonizeEntry = { key: GenomeFieldKey; result: ResolveResult };

/**
 * Re-resolver hvert resolvable felt mod de aktuelle identity-ankre. Felter med
 * en gyldig cache (deps uændret) returnerer cachen uændret; felter med en
 * override forbliver pinned; anchored felter springes over. Sekventielt for at
 * være snill mod LLM-rate-limits.
 */
export async function reharmonizeAll(actor: AuditActor): Promise<ReharmonizeEntry[]> {
  const out: ReharmonizeEntry[] = [];
  for (const key of GENOME_FIELD_KEYS) {
    const field = GENOME_FIELDS[key];
    if (field.lock === "anchored" || !field.resolver) continue;
    const result = await resolveField(key, actor);
    out.push({ key, result });
  }
  return out;
}
