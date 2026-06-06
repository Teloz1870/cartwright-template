import "server-only";

/**
 * Firecrawl-wrapper — scraper en URL til markdown/html/metadata/billeder.
 * Bruger Firecrawl REST direkte via fetch (ingen ny dependency, fuldt mockbar).
 * Key fra env FIRECRAWL_API_KEY (en fremtidig krypteret IntegrationSettings-key
 * er en simpel udvidelse). Fail-soft: mangler key / fejl → null, så caller kan
 * vise en pæn besked.
 */

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v1";

export type FirecrawlScrape = {
  markdown: string;
  html: string;
  metadata: Record<string, unknown>;
  images: string[];
};

let keyCache: { value: string | null; expiresAt: number } | null = null;
const KEY_TTL_MS = 30_000;

async function getFirecrawlKey(): Promise<string | null> {
  const now = Date.now();
  if (keyCache && keyCache.expiresAt > now) return keyCache.value;
  const value: string | null = process.env.FIRECRAWL_API_KEY?.trim() || null;
  keyCache = { value, expiresAt: now + KEY_TTL_MS };
  return value;
}

export function invalidateFirecrawlKeyCache(): void {
  keyCache = null;
}

/** Træk billed-URL'er ud af scraped doc (ogImage + <img src>). */
export function extractImages(doc: { html?: string; metadata?: Record<string, unknown> }): string[] {
  const out: string[] = [];
  const og = doc.metadata?.ogImage;
  if (typeof og === "string") out.push(og);
  const html = doc.html ?? "";
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 20) {
    const src = m[1];
    if (/^https?:\/\//i.test(src)) out.push(src);
  }
  return [...new Set(out)];
}

export async function scrapeUrl(url: string): Promise<FirecrawlScrape | null> {
  const key = await getFirecrawlKey();
  if (!key) return null;
  try {
    const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ url, formats: ["markdown", "html"] }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { markdown?: string; html?: string; metadata?: Record<string, unknown> } };
    const doc = data.data ?? {};
    return {
      markdown: doc.markdown ?? "",
      html: doc.html ?? "",
      metadata: doc.metadata ?? {},
      images: extractImages(doc),
    };
  } catch {
    return null;
  }
}

export async function isFirecrawlConfigured(): Promise<boolean> {
  return (await getFirecrawlKey()) !== null;
}
