import "server-only";

import { prisma } from "@/lib/db";
import type { AuditActor } from "@/lib/audit";
import { applyFieldOverride } from "@/lib/genome/apply";
import { readField } from "@/lib/genome/read";
import { isGenomeFieldKey, type GenomeFieldKey } from "@/lib/genome/fields";

/**
 * Selvforbedrings-loopens hjerte. Et eksperiment = en genome-felt-ændring med en
 * baseline-metrik. Efter en periode evalueres: forbedrede metrikken sig →
 * BEHOLD; ellers → REVERT (genome override-reset). Konservativ: kun reelle
 * forbedringer beholdes, så autopiloten aldrig kan gøre skade permanent.
 */

export type SeoMetric = { clicks: number; position: number | null };

/** Den rene keep/revert-beslutning — testbar i isolation. */
export function decideKeepOrRevert(
  baseline: SeoMetric,
  current: SeoMetric,
): { keep: boolean; reason: string } {
  if (current.clicks > baseline.clicks) {
    return { keep: true, reason: `klik op ${baseline.clicks}→${current.clicks}` };
  }
  if (
    baseline.position != null &&
    current.position != null &&
    current.position < baseline.position - 0.5
  ) {
    return { keep: true, reason: `position ${baseline.position.toFixed(1)}→${current.position.toFixed(1)}` };
  }
  if (current.clicks < baseline.clicks) {
    return { keep: false, reason: `klik faldt ${baseline.clicks}→${current.clicks}` };
  }
  return { keep: false, reason: "ingen forbedring" };
}

export async function startExperiment(
  fieldKey: string,
  candidateValue: string,
  baseline: SeoMetric,
  actor: AuditActor,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!isGenomeFieldKey(fieldKey)) return { ok: false, error: `'${fieldKey}' er ikke et genome-felt.` };

  const before = await readField(fieldKey as GenomeFieldKey).catch(() => null);
  const applied = await applyFieldOverride(fieldKey, candidateValue, actor);
  if (!applied.ok) return { ok: false, error: applied.error };

  const exp = await prisma.seoExperiment.create({
    data: {
      fieldKey,
      beforeValue: before ?? null,
      afterValue: candidateValue,
      baselineJson: JSON.stringify(baseline),
    },
  });
  return { ok: true, id: exp.id };
}

export async function evaluateExperiment(
  experimentId: string,
  current: SeoMetric,
  actor: AuditActor,
): Promise<{ decision: "kept" | "reverted" | "skipped"; reason: string }> {
  const exp = await prisma.seoExperiment.findUnique({ where: { id: experimentId } });
  if (!exp || exp.status !== "running") return { decision: "skipped", reason: "ikke kørende" };

  const baseline = JSON.parse(exp.baselineJson) as SeoMetric;
  const d = decideKeepOrRevert(baseline, current);

  if (!d.keep) {
    // Revert: nulstil override (→ resolver/anker igen) eller sæt tilbage til before.
    await applyFieldOverride(exp.fieldKey, exp.beforeValue ?? null, actor);
  }

  await prisma.seoExperiment.update({
    where: { id: experimentId },
    data: { status: d.keep ? "kept" : "reverted", evaluatedAt: new Date(), resultNote: d.reason },
  });

  return { decision: d.keep ? "kept" : "reverted", reason: d.reason };
}
