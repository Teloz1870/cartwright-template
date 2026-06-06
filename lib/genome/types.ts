import type { z } from "zod";

/**
 * Resolvable Genome — type-kernen.
 *
 * Hele forretningen modelleres som et felt-rum hvor hvert felt er et
 * `Resolvable<T>`: et config-default ANKER, en valgfri DB-override, en valgfri
 * LLM-resolver betinget af identity-ankrene, en lock-bit, og et dependency-sæt.
 * Én læse-operation (readField, ren render-sti, ALDRIG en LLM) og én resolve-
 * operation (resolveField, triggered) deler dette skema. Se lib/genome/THESIS.md.
 *
 * Pure type-modul — INGEN runtime-imports (kan importeres af både server- og
 * type-kontekster uden "server-only"-grænsen).
 */

/** Lås: "anchored" = aldrig resolve (brug override ?? anker); "resolvable" = LLM-resolver må udfylde. */
export type LockBit = "anchored" | "resolvable";

/** Identity-ankrene resolvers betinges af — matcher keys i brand.config.identity. */
export type GenomeAnchorKey = "tone" | "audience" | "formality" | "vibe";

/** De deps en resolver får: de aktive identity-ankre + storeName-kontekst. */
export type GenomeDeps = {
  tone: string;
  audience: string;
  formality: string;
  vibe: string;
  storeName: string;
};

export type Resolvable<T> = {
  /** Config-default ANKER (render-værdien når flaget er off / cache er tom). */
  anchor: T;
  /** anchored = aldrig LLM; resolvable = resolver må udfylde når triggered. */
  lock: LockBit;
  /** Identity-ankre denne felts resolver er betinget af (driver invalidering). */
  dependsOn: readonly GenomeAnchorKey[];
  /** Validerer både override-input og resolver-output. */
  schema: z.ZodType<T>;
  /** Menneske-label til admin-UI + resolver-prompt. */
  label: string;
  /** Typet LLM-resolver. Fraværende ⇒ feltet opfører sig som anchored. */
  resolver?: (deps: GenomeDeps) => Promise<T>;
};

/** Den per-shop genome-state der serialiseres til BrandingSettings.genomeJson. */
export type GenomeBlob = {
  /** Human/AI-satte felt-værdier (vinder over resolver + anker). */
  overrides?: Record<string, string>;
  /** LLM-resolved cache pr. felt, keyed by de deps der producerede værdien. */
  resolved?: Record<string, { value: string; deps: string }>;
  /** Identity-anker-overrides sat uden redeploy (merges over brand.config.identity). */
  identity?: Partial<Record<GenomeAnchorKey, string>>;
};
