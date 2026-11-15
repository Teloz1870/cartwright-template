import "server-only";

import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";
import type { GenomeAnchorKey, GenomeBlob, GenomeDeps, Resolvable } from "./types";
import { brandingCreateDefaults } from "@/lib/branding-defaults";

/**
 * Genome-state-laget: læser/parser/skriver BrandingSettings.genomeJson med en
 * 30s cache (samme mønster som lib/three/resolve.ts). Fail-soft: korrupt/hostil
 * JSON breaker aldrig render — den falder tilbage til {} (→ brand.config-ankre).
 *
 * Adskiller READ (loadGenome, ren) fra WRITE (mutateGenome) så render-stien
 * aldrig kalder en LLM eller muterer noget.
 */

const ANCHOR_KEYS: readonly GenomeAnchorKey[] = [
  "tone",
  "audience",
  "formality",
  "vibe",
];

/** Parse en lagret genome-blob til en valideret form (junk droppes). */
export function parseGenome(raw: string | null | undefined): GenomeBlob {
  if (!raw) return {};
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  const o = obj as Record<string, unknown>;
  const out: GenomeBlob = {};

  if (o.overrides && typeof o.overrides === "object" && !Array.isArray(o.overrides)) {
    const ov: Record<string, string> = {};
    for (const [k, v] of Object.entries(o.overrides as Record<string, unknown>)) {
      if (typeof v === "string") ov[k] = v;
    }
    if (Object.keys(ov).length) out.overrides = ov;
  }

  if (o.resolved && typeof o.resolved === "object" && !Array.isArray(o.resolved)) {
    const rs: NonNullable<GenomeBlob["resolved"]> = {};
    for (const [k, v] of Object.entries(o.resolved as Record<string, unknown>)) {
      if (
        v &&
        typeof v === "object" &&
        typeof (v as Record<string, unknown>).value === "string" &&
        typeof (v as Record<string, unknown>).deps === "string"
      ) {
        rs[k] = {
          value: (v as { value: string }).value,
          deps: (v as { deps: string }).deps,
        };
      }
    }
    if (Object.keys(rs).length) out.resolved = rs;
  }

  if (o.identity && typeof o.identity === "object" && !Array.isArray(o.identity)) {
    const id: Partial<Record<GenomeAnchorKey, string>> = {};
    for (const k of ANCHOR_KEYS) {
      const v = (o.identity as Record<string, unknown>)[k];
      if (typeof v === "string") id[k] = v;
    }
    if (Object.keys(id).length) out.identity = id;
  }

  if (
    o.entityOverrides &&
    typeof o.entityOverrides === "object" &&
    !Array.isArray(o.entityOverrides)
  ) {
    const eo: Record<string, string> = {};
    for (const [k, v] of Object.entries(o.entityOverrides as Record<string, unknown>)) {
      if (typeof v === "string") eo[k] = v;
    }
    if (Object.keys(eo).length) out.entityOverrides = eo;
  }

  return out;
}

let cache: { value: GenomeBlob; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

/** 30s-cached genome-blob fra DB. Fail-soft til {} ved DB-fejl. */
export async function loadGenome(): Promise<GenomeBlob> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;
  try {
    const row = await prisma.brandingSettings.findUnique({
      where: { id: 1 },
      select: { genomeJson: true },
    });
    const value = parseGenome(row?.genomeJson);
    cache = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch {
    cache = { value: {}, expiresAt: now + CACHE_TTL_MS };
    return {};
  }
}

export function invalidateGenomeCache(): void {
  cache = null;
}

/** De aktive identity-ankre = brand.config.identity merged med genome.identity-overrides. */
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

/**
 * Stabil nøgle for en felts resolver-output: kun de deps feltet faktisk
 * dependsOn, sorteret, så ændring af et urelateret anker IKKE invaliderer.
 */
export function depsKey(field: Resolvable<unknown>, deps: GenomeDeps): string {
  const subset: Record<string, string> = {};
  for (const k of [...field.dependsOn].sort()) {
    subset[k] = deps[k];
  }
  return JSON.stringify(subset);
}

/**
 * Læs-modificer-skriv på genomeJson (altid frisk fra DB, ikke cache). Caller
 * wrapper i withAudit. Invaliderer cachen efter. create-grenen spejler
 * lib/three/apply.ts (samme påkrævede BrandingSettings-felter).
 */
export async function mutateGenome(
  mutator: (current: GenomeBlob) => GenomeBlob,
): Promise<void> {
  const row = await prisma.brandingSettings.findUnique({
    where: { id: 1 },
    select: { genomeJson: true },
  });
  const current = parseGenome(row?.genomeJson);
  const next = mutator(current);
  const hasContent =
    (next.overrides && Object.keys(next.overrides).length) ||
    (next.resolved && Object.keys(next.resolved).length) ||
    (next.identity && Object.keys(next.identity).length) ||
    (next.entityOverrides && Object.keys(next.entityOverrides).length);
  const json = hasContent ? JSON.stringify(next) : null;

  await prisma.brandingSettings.upsert({
    where: { id: 1 },
    update: { genomeJson: json },
    create: {
      ...brandingCreateDefaults(),
      genomeJson: json,
    },
  });
  invalidateGenomeCache();
}

/** Læs den aktuelle genomeJson-string (til withAudit before-snapshot). */
export async function readGenomeJson(): Promise<string | null> {
  const row = await prisma.brandingSettings.findUnique({
    where: { id: 1 },
    select: { genomeJson: true },
  });
  return row?.genomeJson ?? null;
}
