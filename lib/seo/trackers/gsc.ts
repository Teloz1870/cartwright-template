import "server-only";

/**
 * Google Search Console-tracker (default SEO-kilde, GRATIS + autoritativ). STUB:
 * kræver OAuth2 (Search Console API) + property-verifikation. Implementér
 * fetchGscMetrics ved at kalde searchanalytics.query og map'e til SeoSnapshot.
 * Dok: https://developers.google.com/webmaster-tools (gratis, rate-limited).
 *
 * SEMrush/Ahrefs er premium-adaptere med samme form (opt-in, koster).
 */

export type SeoTrackerMetric = {
  page: string;
  query: string;
  impressions: number;
  clicks: number;
  position: number;
  ctr: number;
};

export interface SeoTracker {
  readonly name: string;
  fetchMetrics(range: { from: string; to: string }): Promise<SeoTrackerMetric[]>;
}

export class GscTracker implements SeoTracker {
  readonly name = "gsc";
  async fetchMetrics(): Promise<SeoTrackerMetric[]> {
    throw new Error(
      "GSC-tracker er ikke konfigureret. Tilføj Google OAuth2 + property-verifikation og implementér searchanalytics.query (se lib/seo/trackers/gsc.ts).",
    );
  }
}
