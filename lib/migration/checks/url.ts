import type { MigrationFetcher } from "../fetch";

/**
 * MIGD `url.parity` — does every frozen old path still land on the new host?
 * Pure over an injected fetcher (a `migrationFetcher` bound to the new host).
 *
 * Each frozen URL's path + query is requested on the new host and redirects are
 * followed by hand, at most `URL_PARITY_MAX_HOPS`, never off its origin (scheme,
 * host and port — a redirect to http or another port is off-site). Then:
 *
 *   200                         same               (pass when expect=same)
 *   308/301 → 200, only a "/"   same-modulo-slash  (warn)
 *   one redirect → 200          redirect           (pass when expect=301)
 *   two+ redirects → 200, or a loop past the hop cap   chain  (fail)
 *   … → 404 / … → 410           missing / gone     (pass only when expect=gone)
 *   000 / 5xx / 429 at any hop  inconclusive       (never a fail)
 *   anything else               error              (403, empty 2xx, off-origin redirect, no Location,
 *                                                   or a URL the check cannot read — it never throws)
 *
 * A query is part of the identity: a Woo variation URL (`?attribute_pa_*`) is
 * its own row, requested with its own query, and a redirect that drops the
 * query is a `redirect`, not a slash difference. Through a temporary hop
 * (302/303/307) an expected 301 is only a warn.
 */

export const URL_PARITY_MAX_HOPS = 3;

export type UrlExpect = "same" | "301" | "gone";
export type UrlParityClass = "same" | "same-modulo-slash" | "redirect" | "chain" | "missing" | "gone" | "error" | "inconclusive";
export type UrlParityStatus = "pass" | "warn" | "fail" | "inconclusive";
/** `oldUrl` is the frozen absolute source URL; only its path + query travel to the new host. */
export type UrlParityEntry = { oldUrl: string; expect?: UrlExpect; newPath?: string | null };
export type UrlParityResult = {
  oldUrl: string;
  targetUrl: string;
  finalUrl: string;
  variant: boolean;
  expect: UrlExpect;
  class: UrlParityClass;
  status: UrlParityStatus;
  /** The last hop's HTTP status (0 = no response) and every hop taken on the new host. */
  http: number;
  hops: { url: string; status: number }[];
  detail?: string;
};

/** A WooCommerce variation URL: global (`attribute_pa_*`) or local (`attribute_*`) attribute. */
export const isVariantQuery = (url: URL) => [...url.searchParams.keys()].some((k) => k.startsWith("attribute_"));

const stripSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);

/** An http(s) URL, or null — never a throw. */
function httpUrl(raw: string, base?: URL): URL | null {
  const url = URL.canParse(raw, base) ? new URL(raw, base) : null;
  return url && (url.protocol === "http:" || url.protocol === "https:") ? url : null;
}

/** The row's URLs, or why they cannot be read (a check never throws on its input). */
function readInput(entry: UrlParityEntry, targetOrigin: string): { old: URL; origin: URL } | { unreadable: string } {
  const old = httpUrl(entry.oldUrl);
  if (!old) return { unreadable: "the frozen URL is not an http(s) URL" };
  const origin = httpUrl(targetOrigin);
  if (!origin) return { unreadable: "the target origin is not an http(s) URL" };
  if (entry.newPath && !httpUrl(entry.newPath, origin)) return { unreadable: "the expected newPath is not a URL path" };
  return { old, origin };
}

export async function classifyUrl(
  entry: UrlParityEntry,
  ctx: { targetOrigin: string; fetch: MigrationFetcher; maxHops?: number },
): Promise<UrlParityResult> {
  const expect = entry.expect ?? "same";
  const input = readInput(entry, ctx.targetOrigin);
  if ("unreadable" in input) {
    // Input the check cannot read is an error row, and nothing is requested.
    return {
      oldUrl: entry.oldUrl, targetUrl: "", finalUrl: "", variant: false,
      expect, class: "error", status: "fail", http: 0, hops: [], detail: input.unreadable,
    };
  }
  const { old, origin } = input;
  // Path and query are assigned, never resolved against the origin: a source
  // path `//old.example.test/a` is a network-path reference, and resolving it
  // would send the request to the SOURCE host.
  const target = new URL(origin.origin);
  target.pathname = old.pathname;
  target.search = old.search;
  const maxHops = ctx.maxHops ?? URL_PARITY_MAX_HOPS;
  const hops: UrlParityResult["hops"] = [];
  let current = target;

  const done = (cls: UrlParityClass, detail?: string): UrlParityResult => {
    const temporary = hops.slice(0, -1).some((h) => h.status !== 301 && h.status !== 308);
    const expectedFinal = entry.newPath ? new URL(entry.newPath, origin).href : null;
    const verdict = judge(cls, temporary, expect, expectedFinal, current.href);
    const why = verdict.detail ?? detail;
    const http = hops.at(-1)?.status ?? 0;
    return {
      oldUrl: entry.oldUrl, targetUrl: target.href, finalUrl: current.href, variant: isVariantQuery(old),
      expect, class: cls, status: verdict.status, http, hops, ...(why ? { detail: why } : {}),
    };
  };

  for (;;) {
    const res = await ctx.fetch(current.href);
    hops.push({ url: current.href, status: res.status });
    if (res.outcome === "inconclusive") return done("inconclusive", res.reason);
    if (res.outcome !== "answer") return done("error", res.reason);
    const s = res.status;
    if (s >= 300 && s < 400) {
      if (hops.length > maxHops) return done("chain", `still redirecting after ${maxHops} hops`);
      if (!res.location) return done("error", `HTTP ${s} without Location`);
      const next = URL.canParse(res.location, current) ? new URL(res.location, current) : null;
      if (!next) return done("error", `HTTP ${s} with an unreadable Location`);
      // The origin, not the host: an https→http downgrade or another port is not the new site.
      if (next.origin !== origin.origin) return done("error", `redirect leaves ${origin.origin} for ${next.origin}`);
      current = next;
      continue;
    }
    const redirects = hops.length - 1;
    if (s === 404) return done("missing");
    if (s === 410) return done("gone");
    if (redirects >= 2) return done("chain", `${redirects} redirects before the page`);
    if (s < 200 || s >= 300) return done("error", `HTTP ${s}`);
    if (redirects === 0) return done("same");
    const slashOnly =
      current.search === target.search &&
      current.pathname !== target.pathname &&
      stripSlash(current.pathname) === stripSlash(target.pathname);
    return done(slashOnly ? "same-modulo-slash" : "redirect");
  }
}

/** The row's verdict: the class judged against what the frozen row expects. */
function judge(cls: UrlParityClass, temporary: boolean, expect: UrlExpect, expectedFinal: string | null, finalUrl: string) {
  const v = (status: UrlParityStatus, detail?: string) => ({ status, detail });
  if (cls === "inconclusive") return v("inconclusive");
  if (expect === "gone") return v(cls === "missing" || cls === "gone" ? "pass" : "fail");
  if (expect === "same") return v(cls === "same" ? "pass" : cls === "same-modulo-slash" ? "warn" : "fail");
  if (cls !== "redirect" && cls !== "same-modulo-slash") return v("fail");
  if (expectedFinal && expectedFinal !== finalUrl) return v("fail", `redirects to ${finalUrl}, expected ${expectedFinal}`);
  return v(temporary ? "warn" : "pass");
}

export type UrlParitySummary = {
  status: UrlParityStatus | "skip";
  counts: Record<UrlParityStatus, number>;
  classes: Partial<Record<UrlParityClass, number>>;
  processed: number;
  /** At most 20 non-pass rows: fails, then inconclusive, then warns. */
  firstErrors: UrlParityResult[];
};

export function summarizeUrlParity(results: readonly UrlParityResult[]): UrlParitySummary {
  const counts: Record<UrlParityStatus, number> = { pass: 0, warn: 0, fail: 0, inconclusive: 0 };
  const classes: Partial<Record<UrlParityClass, number>> = {};
  for (const r of results) {
    counts[r.status]++;
    classes[r.class] = (classes[r.class] ?? 0) + 1;
  }
  const order = ["fail", "inconclusive", "warn"] as const;
  const status = results.length === 0 ? "skip" : (order.find((s) => counts[s] > 0) ?? "pass");
  const firstErrors = order.flatMap((s) => results.filter((r) => r.status === s)).slice(0, 20);
  return { status, counts, classes, processed: results.length, firstErrors };
}
