import { describe, expect, it } from "vitest";

import { fetchText, guardBaseUrl, probe, warnLiveSkipped } from "./_shared";

/**
 * LIVE — nothing in this list, rendered on the homepage, may 404.
 *
 * This is #572's class, measured instead of reasoned about. The nav was fixed
 * once; the same dead links were still in two design packs, in both footers and
 * in the first screen a new owner sees, because every check was a source grep
 * and a source grep cannot see what the page actually rendered. A profile
 * prunes routes, the CLI prunes files, a design pack hard-codes an href, and
 * the only place all three meet is the served HTML.
 *
 * WHAT IT CHECKS on `/` (which redirects to the default locale) — the list is
 * exhaustive, and it is written out because "everything the page points at" is
 * a claim this guard does not make:
 *   · every same-origin `<a href>` that is root-relative or absolute — the
 *     header, the footer, the hero, the chrome of whatever design pack is
 *     active
 *   · the favicon (`<link rel="…icon">`), because a scaffold that pruned the
 *     icon route serves a broken tab
 *   · `og:image`, because a share card that 404s is a blank card in every chat
 *     app the page is pasted into
 *   · the JSON-LD `logo`, which is what an AI crawler reads as the brand mark
 *
 * WHAT IT DOES NOT CHECK, so nobody reads a green run as more than it is:
 * `<img>`, `<picture>`/`<source>`, `<video>`, `<script src>` and stylesheet
 * `<link>`s (Next fingerprints its own asset URLs, so the interesting failures
 * there are build failures, not 404s); PATH-RELATIVE hrefs like `href="cases"`,
 * which resolve against the current path and are vanishingly rare in this
 * chrome; and anything past the first `CAP` unique targets, which is announced
 * on stderr when it bites. Adding a collector is a welcome diff — the shape is
 * one `matchAll` and a `push`.
 *
 * ABSOLUTE URLS ARE RE-ANCHORED, NOT SKIPPED. `og:image` and the JSON-LD logo
 * are absolute, built from `brand.url` — which in a fresh scaffold is the
 * `example.com` placeholder. Fetching that literally would test the internet.
 * So an absolute URL whose origin is not the probe origin has its PATH
 * requested against `GUARD_BASE_URL`, and the message says that is what
 * happened: the question is "does this app serve that asset", not "is the
 * placeholder domain registered".
 *
 * Skipped loudly without `GUARD_BASE_URL`, and reported PENDING rather than
 * passed. No gate supplies that variable yet (see `_shared.ts`), so today the
 * distinction is for the human reading the run.
 *
 * KNOWN RED IN A FRESH SCAFFOLD, and in this engine: `/services` and `/info`.
 * Both come from `brand.config.ts` — `secondaryCtaHref` and
 * `ctaFooterSecondaryHref` — so a source grep over components cannot see them,
 * which is why they survived #572. `/info` has no index page anywhere (only
 * `app/[locale]/info/[slug]`), and `/services` is pruned by the `light` and
 * `site` profiles. Reproduced on production, not just locally. Fixing them
 * means changing two config values that three live deploys render today, so it
 * is a backlog item and not this PR's; `README.md` names both so a customer who
 * sees the red knows it is ours.
 */
const base = guardBaseUrl();
if (!base) warnLiveSkipped("chrome-no-dead-links");

/** Enough to cover a chrome; small enough that a slow scaffold still finishes. */
const CAP = 80;

const SKIP_SCHEMES = /^(mailto:|tel:|javascript:|data:|blob:|#)/i;

function sameOriginPath(raw: string, origin: string): string | null {
  const href = raw.trim();
  if (!href || SKIP_SCHEMES.test(href)) return null;
  if (href.startsWith("//")) return null; // protocol-relative → another host
  if (href.startsWith("/")) return href.split("#")[0];
  if (/^https?:\/\//i.test(href)) {
    try {
      const url = new URL(href);
      if (`${url.protocol}//${url.host}` === origin) return `${url.pathname}${url.search}`;
      return null;
    } catch {
      return null;
    }
  }
  return null; // relative link — resolved by the browser against the current path
}

/** An absolute asset URL re-anchored onto the probe origin (see the docblock). */
function reanchor(raw: string, origin: string): string | null {
  const value = raw.trim();
  if (!value || SKIP_SCHEMES.test(value)) return null;
  if (value.startsWith("/")) return `${origin}${value}`;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return `${origin}${url.pathname}${url.search}`;
    } catch {
      return null;
    }
  }
  return null;
}

type Target = { url: string; kind: string; source: string };

function collectTargets(html: string, origin: string): Target[] {
  const out: Target[] = [];
  const seen = new Set<string>();
  const push = (url: string | null, kind: string, source: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ url, kind, source });
  };

  for (const match of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    const path = sameOriginPath(match[1], origin);
    if (path) push(`${origin}${path}`, "link", match[1]);
  }

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\brel=["'][^"']*icon/i.test(tag)) continue;
    const href = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1];
    if (href) push(reanchor(href, origin), "icon", href);
  }

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\b(property|name)=["']og:image(:url)?["']/i.test(tag)) continue;
    const content = /\bcontent=["']([^"']+)["']/i.exec(tag)?.[1];
    if (content) push(reanchor(content, origin), "og:image", content);
  }

  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    for (const logo of match[1].matchAll(/"logo"\s*:\s*"([^"]+)"/g)) {
      push(reanchor(logo[1], origin), "jsonld-logo", logo[1]);
    }
    for (const logo of match[1].matchAll(/"logo"\s*:\s*\{[^}]*?"url"\s*:\s*"([^"]+)"/g)) {
      push(reanchor(logo[1], origin), "jsonld-logo", logo[1]);
    }
  }

  return out;
}

describe("guard: the chrome links nothing dead", () => {
  it.skipIf(!base)("the homepage answers", async () => {
    const home = await fetchText(`${base}/`);
    expect(
      home.status,
      `GET ${base}/ answered ${home.status}. Everything below reads that page, so a guard ` +
        "run against a stopped server proves nothing.",
    ).toBe(200);
    expect(home.body.length, "The homepage answered 200 with an empty body.").toBeGreaterThan(200);
  });

  it.skipIf(!base)("every same-origin href, icon, og:image and JSON-LD logo answers 2xx", async () => {
    const origin = new URL(base as string).origin;
    const home = await fetchText(`${base}/`);
    const targets = collectTargets(home.body, origin);

    expect(
      targets.length,
      "The homepage rendered no same-origin links at all — no header, no footer, no chrome. " +
        "A guard that finds nothing to check is not a passing guard.",
    ).toBeGreaterThan(0);

    const checked = targets.slice(0, CAP);
    const results = await Promise.all(
      checked.map(async (t) => ({ target: t, result: await probe(t.url) })),
    );
    const broken = results.filter(({ result }) => result.status < 200 || result.status >= 300);
    const detail = broken
      .map(
        ({ target, result }) =>
          `  [${target.kind}] ${target.source}\n      → ${result.status || "no response"} ` +
          `${result.error ?? ""} (${target.url})`,
      )
      .join("\n");

    expect(
      broken.map((b) => `${b.target.kind} ${b.target.source} → ${b.result.status}`),
      broken.length
        ? `\n${broken.length} of ${checked.length} things the homepage points at ` +
            `${broken.length === 1 ? "does" : "do"} not answer 2xx:\n\n${detail}\n\n` +
            "A `link` here is a route the visitor can click and a crawler will follow. An " +
            "`icon`, `og:image` or `jsonld-logo` is an asset every share of this page embeds. " +
            "Absolute asset URLs were re-anchored onto the probe origin, so a failure means " +
            "THIS app does not serve that path — not that the configured domain is " +
            "unreachable.\n"
        : "",
    ).toEqual([]);

    if (targets.length > CAP) {
      console.warn(
        `[guards] chrome-no-dead-links: checked the first ${CAP} of ${targets.length} targets.`,
      );
    }
  });
});
