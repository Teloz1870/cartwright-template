import "server-only";

import { withAudit, type AuditActor } from "@/lib/audit";
import { GENOME_FIELDS, type GenomeFieldKey } from "./fields";
import { activeDeps, depsKey, loadGenome, mutateGenome, readGenomeJson } from "./store";

/**
 * RESOLVE-stien — TRIGGERED only (admin-action / AI-tool / reharmonize), aldrig
 * fra render. Må kalde en LLM-resolver, validerer output, og cacher det tilbage
 * i genomeJson.resolved (keyed by de deps der producerede det) under audit.
 *
 * Precedence: override (intet at resolve) → anchored/ingen-resolver (anker) →
 * gyldig cache (genbrug) → kør resolver. Fail-soft: enhver resolver-/LLM-fejl
 * eller invalid output returnerer en fejl uden at mutere — render-ankeret står.
 */

export type ResolveResult =
  | { ok: true; value: string; cached: boolean }
  | { ok: false; error: string };

export async function resolveField(
  key: GenomeFieldKey,
  actor: AuditActor,
): Promise<ResolveResult> {
  const field = GENOME_FIELDS[key];
  const genome = await loadGenome();

  // override vinder — at resolve er meningsløst når et menneske/AI har pinnet en værdi.
  const ov = genome.overrides?.[key];
  if (ov !== undefined) {
    const p = field.schema.safeParse(ov);
    if (p.success) return { ok: true, value: p.data, cached: true };
  }

  // anchored eller ingen resolver → intet at resolve.
  if (field.lock === "anchored" || !field.resolver) {
    return { ok: true, value: field.anchor, cached: true };
  }

  const deps = activeDeps(genome);
  const dk = depsKey(field, deps);

  // gyldig cache for aktuelle deps → genbrug, ingen LLM.
  const cached = genome.resolved?.[key];
  if (cached && cached.deps === dk) {
    const p = field.schema.safeParse(cached.value);
    if (p.success) return { ok: true, value: p.data, cached: true };
  }

  // kør resolver (LLM), validér, persistér under audit.
  try {
    const raw = await field.resolver(deps);
    const parsed = field.schema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: `Resolver-output ugyldigt for '${key}'.` };
    }
    const value = parsed.data;
    await withAudit(
      {
        actor,
        tool: "genome.resolve",
        args: { key, deps: dk },
        before: readGenomeJson,
      },
      async () => {
        await mutateGenome((cur) => ({
          ...cur,
          resolved: { ...(cur.resolved ?? {}), [key]: { value, deps: dk } },
        }));
      },
    );
    return { ok: true, value, cached: false };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : `Resolve fejlede for '${key}'.`,
    };
  }
}
