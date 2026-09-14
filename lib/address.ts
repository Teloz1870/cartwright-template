import "server-only";

const DAWA_URL = "https://api.dataforsyningen.dk/autocomplete";
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 4000;

export type AddressMatch = {
  display: string;
  address: string;
  zip: string;
  city: string;
};

type CachedEntry = { matches: AddressMatch[]; expiresAt: number };
const cache = new Map<string, CachedEntry>();

export async function searchAddresses(query: string, opts?: { perPage?: number }): Promise<AddressMatch[]> {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length < 2) return [];

  const now = Date.now();
  const cached = cache.get(normalizedQuery);
  if (cached && cached.expiresAt > now) {
    return cached.matches;
  }

  const url = `${DAWA_URL}?q=${encodeURIComponent(query)}&type=adresse&per_side=${opts?.perPage ?? 5}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`DAWA API returned HTTP ${response.status}`);
    }
    const data = await response.json() as Array<{
      tekst: string;
      adresse?: {
        vejnavn?: string;
        husnr?: string;
        postnr?: string;
        postnrnavn?: string;
      };
    }>;

    const matches: AddressMatch[] = data
      .filter((item) => item.adresse?.vejnavn && item.adresse?.husnr && item.adresse?.postnr && item.adresse?.postnrnavn)
      .map((item) => {
        const adr = item.adresse!;
        return {
          display: item.tekst,
          address: `${adr.vejnavn} ${adr.husnr}`,
          zip: adr.postnr!,
          city: adr.postnrnavn!,
        };
      });

    cache.set(normalizedQuery, { matches, expiresAt: now + CACHE_TTL_MS });
    return matches;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("DAWA request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function _clearCacheForTest(): void {
  cache.clear();
}
