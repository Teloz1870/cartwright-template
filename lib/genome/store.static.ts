import "server-only";

import { brand } from "@/brand.config";
import type { GenomeAnchorKey, GenomeBlob, GenomeDeps, Resolvable } from "./types";

/**
 * B3 static seam variant — the genome store WITHOUT a database (site-profile
 * program, `internal-docs/site-profile-ultraplan.md` §5). The materializer
 * copies this file over `lib/genome/store.ts` when the db module is not in
 * the profile; NOTHING imports it in the shipped engine (byte-identical
 * until then).
 *
 * The genome READ path (lib/genome/read.ts) stays fully functional: an empty
 * blob means every readField returns its anchor — the matching brand.config
 * value — which is exactly what a db profile renders with an empty genome.
 * The WRITE path (admin/AI resolution) belongs to the admin module and does
 * not exist in this profile; mutateGenome throws so a miswired call fails
 * loudly instead of silently dropping copy.
 */

/** No storage layer → every stored-blob parse yields the empty genome. */
export function parseGenome(_raw: string | null | undefined): GenomeBlob {
  return {};
}

/** No DB → the empty genome (readField → anchors = brand.config values). */
export async function loadGenome(): Promise<GenomeBlob> {
  return {};
}

export function invalidateGenomeCache(): void {
  // No cache without a store.
}

/** Identity anchors come from brand.config alone (no override layer). */
export function activeDeps(genome: GenomeBlob): GenomeDeps {
  const id = genome.identity ?? {};
  return {
    tone: id.tone ?? brand.identity.tone,
    audience: id.audience ?? brand.identity.audience,
    formality: id.formality ?? brand.identity.formality,
    vibe: id.vibe ?? brand.identity.vibe,
    storeName: brand.storeName,
  };
}

/** Same stable deps-key derivation as the db variant (pure). */
export function depsKey(field: Resolvable<unknown>, deps: GenomeDeps): string {
  const subset: Record<string, string> = {};
  for (const k of [...field.dependsOn].sort()) {
    subset[k] = deps[k];
  }
  return JSON.stringify(subset);
}

export async function mutateGenome(
  _mutator: (current: GenomeBlob) => GenomeBlob,
): Promise<void> {
  throw new Error(
    "Genome writes require the db module — this profile has no genome store.",
  );
}

export async function readGenomeJson(): Promise<string | null> {
  return null;
}
