import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Letvægts Unsplash-API-wrapper med DB-cache. Vi bruger gratis dev-tier
 * (50 req/time); 7-dages cache holder os langt under loftet selv ved
 * heavy AI-aktivitet.
 *
 * Setup:
 * 1. Registrér en app på https://unsplash.com/oauth/applications
 * 2. Tilføj UNSPLASH_ACCESS_KEY=... til .env
 * 3. Tool images.search_unsplash kan nu kaldes fra admin-chat
 */

export type UnsplashCandidate = {
  /** Unsplash photo-id, bruges som sourceId for attribution */
  id: string;
  /** Lille billede (≈400px bred) til thumbnails i UI */
  thumbUrl: string;
  /** Større billede (≈1080px) til faktisk produkt-billede */
  regularUrl: string;
  /** Photograph-navn til attribution */
  photographerName: string;
  /** Link til photographens Unsplash-profil */
  photographerUrl: string;
};

const CACHE_TTL_DAYS = 7;
const CACHE_TTL_MS = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;

function queryHash(query: string): string {
  return createHash("sha256").update(query.trim().toLowerCase()).digest("hex");
}

function getUnsplashKey(): string {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    throw new Error(
      "UNSPLASH_ACCESS_KEY mangler i .env. Få en på https://unsplash.com/oauth/applications (gratis dev-tier, 50 req/time).",
    );
  }
  return key;
}

/**
 * Søg billeder på Unsplash. Tjekker cache først; falder tilbage til API-kald.
 * Returnerer normaliserede candidates klar til UI-rendering.
 */
export async function searchUnsplash(
  query: string,
  count = 4,
): Promise<UnsplashCandidate[]> {
  const hash = queryHash(query);

  // Cache-tjek
  const cached = await prisma.imageSearchCache.findUnique({
    where: { queryHash: hash },
  });
  if (cached && cached.expiresAt > new Date()) {
    try {
      const parsed = JSON.parse(cached.resultsJson) as UnsplashCandidate[];
      return parsed.slice(0, count);
    } catch {
      // Korrupt cache — fall-through til frisk API-kald
    }
  }

  // Frisk API-kald
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(Math.max(count, 4)));
  url.searchParams.set("orientation", "squarish");
  url.searchParams.set("content_filter", "high"); // family-friendly

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Client-ID ${getUnsplashKey()}`,
      "Accept-Version": "v1",
    },
    // Cache i HTTP-laget også (i tilfælde af multi-instance)
    next: { revalidate: 60 * 60 * 6 }, // 6 timer
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Unsplash API fejl (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    results: Array<{
      id: string;
      urls: { thumb: string; small: string; regular: string };
      user: { name: string; links: { html: string } };
    }>;
  };

  const candidates: UnsplashCandidate[] = json.results.slice(0, count).map((r) => ({
    id: r.id,
    thumbUrl: r.urls.small, // small er ca 400px — pænt til 192px tile
    regularUrl: r.urls.regular,
    photographerName: r.user.name,
    photographerUrl: r.user.links.html,
  }));

  // Gem i cache (upsert overskriver evt. udløbet entry)
  await prisma.imageSearchCache.upsert({
    where: { queryHash: hash },
    create: {
      queryHash: hash,
      provider: "unsplash",
      query,
      resultsJson: JSON.stringify(candidates),
      expiresAt: new Date(Date.now() + CACHE_TTL_MS),
    },
    update: {
      query,
      resultsJson: JSON.stringify(candidates),
      expiresAt: new Date(Date.now() + CACHE_TTL_MS),
    },
  });

  return candidates;
}
