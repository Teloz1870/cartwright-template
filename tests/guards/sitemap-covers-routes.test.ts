import { describe, expect, it } from "vitest";

import { fetchText, guardBaseUrl, probe, warnLiveSkipped } from "./_shared";

/**
 * LIVE — the sitemap answers, and everything it advertises is real.
 *
 * `llms.txt` calls the sitemap "the complete index of all public pages", so it
 * is the one file an AI crawler trusts without clicking. Owner CW-24, measured
 * on a real `--profile site` scaffold: the site sitemap was a hardcoded
 * skeleton that still listed `/about` and `/privacy` after the profile deleted
 * both pages, and listed none of the owner's own eight pages. Two different
 * defects — advertising what is gone, and omitting what is there.
 *
 * THIS GUARD OWNS THE FIRST HALF. Every `<loc>` must resolve: a sitemap entry
 * that 404s is a crawler being sent to a dead page under the customer's own
 * domain, and it is checkable from nothing but the running app. It also pins
 * the floor — the sitemap exists, parses, and lists the homepage of every
 * locale the app actually serves — so a sitemap that silently degrades to
 * "empty but 200" fails here.
 *
 * THE SECOND HALF IS NOT HERE, AND THIS IS NOT AN OVERSIGHT. "Every real page
 * appears" needs the sitemap to walk the route tree at request time, which is
 * B3 (engine PR #576, `lib/site-routes.ts`). Asserting it before that ships
 * would fail every site scaffold cut from this engine for a defect this PR does
 * not fix, and the failure would say nothing new. When #576 lands, the
 * completeness leg belongs here, next to the reachability one.
 *
 * Skipped loudly without `GUARD_BASE_URL`, and reported PENDING rather than
 * passed. No gate supplies that variable yet (see `_shared.ts`) — the intended
 * step reads the JSON reporter and asserts these RAN, and it has not been
 * written.
 */
const base = guardBaseUrl();
if (!base) warnLiveSkipped("sitemap-covers-routes");

/** Enough to catch a stale skeleton; small enough not to crawl a real catalogue. */
const CAP = 40;

export function parseLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1]);
}

/** The locales the app serves, read from the homepage's hreflang alternates. */
export function servedLocales(html: string, fallback: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/<link\b[^>]*\brel=["']alternate["'][^>]*>/gi)) {
    const tag = match[0];
    const lang = /\bhreflang=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!lang || lang.toLowerCase() === "x-default") continue;
    found.add(lang.split("-")[0]);
  }
  if (!found.size) found.add(fallback);
  return [...found];
}

describe("guard: the sitemap covers the routes it claims", () => {
  it.skipIf(!base)("/sitemap.xml answers 200 with at least one URL", async () => {
    const res = await fetchText(`${base}/sitemap.xml`);
    expect(
      res.status,
      `GET ${base}/sitemap.xml answered ${res.status}. Every discovery surface — Google, ` +
        "Bing and the `llms.txt` line that calls it the complete index — points here.",
    ).toBe(200);
    const locs = parseLocs(res.body);
    expect(
      locs.length,
      "The sitemap answered 200 and listed no URLs. An empty index is worse than none: it " +
        "tells a crawler the site has no pages.",
    ).toBeGreaterThan(0);
  });

  it.skipIf(!base)("every URL in the sitemap answers 2xx", async () => {
    const origin = new URL(base as string).origin;
    const res = await fetchText(`${base}/sitemap.xml`);
    const locs = parseLocs(res.body).slice(0, CAP);

    // The sitemap is built from `brand.url`, which is a placeholder in a fresh
    // scaffold — probe the PATH against the running app, same reasoning as
    // chrome-no-dead-links' re-anchoring.
    const targets = locs.map((loc) => {
      try {
        const url = new URL(loc);
        return { loc, url: `${origin}${url.pathname}${url.search}` };
      } catch {
        return { loc, url: `${origin}${loc.startsWith("/") ? loc : `/${loc}`}` };
      }
    });

    const results = await Promise.all(
      targets.map(async (t) => ({ ...t, result: await probe(t.url) })),
    );
    const broken = results.filter((r) => r.result.status < 200 || r.result.status >= 300);
    const detail = broken
      .map((b) => `  ${b.loc}\n      → ${b.result.status || "no response"} (${b.url})`)
      .join("\n");

    expect(
      broken.map((b) => `${b.loc} → ${b.result.status}`),
      broken.length
        ? `\n${broken.length} of ${targets.length} sitemap entries do not resolve:\n\n` +
            `${detail}\n\n` +
            "The sitemap is advertising pages this app does not serve — the CW-24 defect: a " +
            "profile removed the route and the sitemap kept the URL. Paths were probed " +
            "against the running app, so a failure is not about the configured domain.\n"
        : "",
    ).toEqual([]);
  });

  it.skipIf(!base)("the homepage of every locale the app serves is in the sitemap", async () => {
    const home = await fetchText(`${base}/`);
    // `/` redirects to the default locale; the landed URL names it.
    const landed = new URL(home.url);
    const fallback = landed.pathname.split("/").filter(Boolean)[0] ?? "en";
    const locales = servedLocales(home.body, fallback);

    const res = await fetchText(`${base}/sitemap.xml`);
    const paths = parseLocs(res.body).map((loc) => {
      try {
        return new URL(loc).pathname.replace(/\/+$/, "") || "/";
      } catch {
        return loc.replace(/\/+$/, "") || "/";
      }
    });

    const missing = locales.filter((locale) => !paths.includes(`/${locale}`));
    expect(
      missing,
      missing.length
        ? `\nThe app serves ${locales.join(", ")} but the sitemap does not list ` +
            `${missing.map((l) => `/${l}`).join(", ")}.\n\n` +
            "A sitemap that omits a locale's own front page tells every crawler that half " +
            "the site does not exist. Listed paths were: " +
            `${paths.slice(0, 12).join(", ")}${paths.length > 12 ? " …" : ""}\n`
        : "",
    ).toEqual([]);
  });
});
