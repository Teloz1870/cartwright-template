import "server-only";

import { prisma } from "@/lib/db";
import { withAudit, type AuditActor } from "@/lib/audit";
import { brandingCreateDefaults } from "@/lib/branding-defaults";

/**
 * SEO-indekserings-indstillinger (BrandingSettings.seoIndexing/aiCrawlers).
 * Læst af robots.ts + app/layout.tsx (meta robots). 30s cache, fail-soft til
 * defaults (public/allow = uændret adfærd).
 */

export type SeoIndexing = "public" | "noindex";
/**
 * AI-crawler-politik (Cloudflare-taksonomien Search/Agent/Training, juli 2026):
 *  - "allow"          → alle AI-crawlere velkomne (GEO-default).
 *  - "block-training" → bloker kun trænings-crawlere (GPTBot, ClaudeBot, …);
 *                       AI-søgning + agent-bots (der handler for kunder) må stadig.
 *  - "block"          → bloker ALLE AI-bots (legacy-værdi; bevaret uændret).
 */
export type AiCrawlers = "allow" | "block-training" | "block";
export type SeoSettings = { indexing: SeoIndexing; aiCrawlers: AiCrawlers };

const DEFAULTS: SeoSettings = { indexing: "public", aiCrawlers: "allow" };

let cache: { value: SeoSettings; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

export async function getSeoSettings(): Promise<SeoSettings> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;
  try {
    const row = await prisma.brandingSettings.findUnique({
      where: { id: 1 },
      select: { seoIndexing: true, aiCrawlers: true },
    });
    const value: SeoSettings = {
      indexing: row?.seoIndexing === "noindex" ? "noindex" : "public",
      aiCrawlers:
        row?.aiCrawlers === "block"
          ? "block"
          : row?.aiCrawlers === "block-training"
            ? "block-training"
            : "allow",
    };
    cache = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch {
    cache = { value: DEFAULTS, expiresAt: now + CACHE_TTL_MS };
    return DEFAULTS;
  }
}

export function invalidateSeoCache(): void {
  cache = null;
}

export async function applySeoSettings(
  patch: Partial<SeoSettings>,
  actor: AuditActor,
): Promise<{ ok: true; settings: SeoSettings } | { ok: false; error: string }> {
  const data: Record<string, string> = {};
  if (patch.indexing) data.seoIndexing = patch.indexing === "noindex" ? "noindex" : "public";
  if (patch.aiCrawlers)
    data.aiCrawlers =
      patch.aiCrawlers === "block"
        ? "block"
        : patch.aiCrawlers === "block-training"
          ? "block-training"
          : "allow";
  if (Object.keys(data).length === 0) return { ok: false, error: "Intet at gemme." };

  try {
    await withAudit(
      { actor, tool: "seo.set_indexing", args: data, before: async () => {
        const r = await prisma.brandingSettings.findUnique({
          where: { id: 1 },
          select: { seoIndexing: true, aiCrawlers: true },
        });
        return r ?? null;
      } },
      async () => {
        await prisma.brandingSettings.upsert({
          where: { id: 1 },
          update: data,
          create: { ...brandingCreateDefaults(), ...data },
        });
      },
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kunne ikke gemme." };
  }

  invalidateSeoCache();
  return { ok: true, settings: await getSeoSettings() };
}
