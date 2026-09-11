import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import manifest from "../../scaffold/manifest.json";
import { ENGINE_ONLY } from "@/scaffold/engine-only";
import {
  CODE_EXT,
  REPO_ROOT,
  isClaimedBy,
  isEngineCheckout,
  stripComments,
  walkCode,
} from "../helpers/claims";

/**
 * The other half of the ledger. `ENGINE_ONLY` says "the CLI deletes this from a
 * customer's scaffold" and a module claim says "the CLI deletes this from a
 * profile that does not include me"; this test says "then nothing the customer
 * KEEPS may link it".
 *
 * That is the #572 class, one layer in: the nav was fixed, and the same dead
 * links were still sitting in two design packs, in both footers and in the
 * first thing a new owner sees. A link to a route the materializer removed is a
 * 404 with our name on it, served from the customer's domain.
 *
 * BOTH HALVES, OR IT COMES BACK. The first version of this file derived its
 * routes from `ENGINE_ONLY` alone, and a falsifier built the scaffold to prove
 * what that missed: the `trust-pages` module removes `app/[locale]/{about,
 * privacy}` from a `site` scaffold, and three surfaces outside the four gated
 * footers still linked them — `components/ConsentBanner.tsx` (rendered from
 * the ROOT layout, so on every page), `designs/agentic-showcase/chrome.tsx`
 * (siteChrome, so on every page) and that pack's hero CTA. Measured on the
 * materialised tree: 3 × `/en/about` and 2 × `/en/privacy` on the homepage
 * alone, all 404. A module claim prunes routes exactly the way the ledger
 * does, so the obligation is now derived for both.
 *
 * TWO OBLIGATIONS, ONE ENGINE:
 *
 *  1. STRICT (`GATED` below) — a route a `profileCapabilities` key answers for
 *     must be gated on that key, per link. The route names are derived: the
 *     engine-marketing ones out of `ENGINE_ONLY`, the trust ones out of the
 *     `trust-pages` module's own claims in `modules/registry.ts`. Adding
 *     `app/[locale]/imprint` to that module immediately puts every file that
 *     links `/imprint` under the obligation; nobody has to remember a list.
 *  2. RATCHET (`KNOWN_UNGATED` below) — every OTHER route the `site` profile
 *     prunes. Those are linked from shipped chrome today (`/contact`,
 *     `/services`, `/produkter`, …) through mechanisms other than a capability,
 *     and pretending otherwise would either fail this suite for twenty-five
 *     pre-existing links or say nothing at all. So the set of such routes is
 *     PINNED with a reason each: a NEW pruned route linked from shipped code
 *     fails here by name, which is the class-closer, while the standing debt
 *     stays visible instead of silent. Removing an entry (because the link got
 *     a gate, or the module joined the profile) is a welcome diff.
 *
 * PER LINK, NOT PER FILE. The obvious cheap version — "this file mentions the
 * capability somewhere" — passes a second, ungated link added to a file that
 * already gates a first one, which is precisely how these accumulate. So each
 * hit is resolved to its enclosing conditional by indentation and THAT line has
 * to carry the capability. Not a parser, and honest about it: the render-side
 * proof lives in `tests/unit/site-nav-no-dead-links.test.tsx`, which mounts the
 * chrome under the static capabilities and asserts the hrefs are gone.
 */

/** Roots whose files ship to a customer. `tests/`, `scripts/` and `docs/` do not render. */
const SHIPPED_ROOTS = [
  "app",
  "components",
  "designs",
  "hooks",
  "i18n",
  "lib",
  "modules",
  "plugins",
  "types",
  "verticals",
];

type Manifest = {
  modules: { slug: string; files: (string | { path: string })[] }[];
  profiles: { name: string; modules: string[] }[];
};
const m = manifest as unknown as Manifest;
const claimsOf = (slug: string) =>
  (m.modules.find((x) => x.slug === slug)?.files ?? []).map((f) =>
    typeof f === "string" ? f : f.path,
  );

const engineOnlyPaths = ENGINE_ONLY.map((e) => e.path);

/** The leanest profile: everything not in it is a route some customer will not have. */
const SITE_MODULES = new Set([
  "core",
  ...(m.profiles.find((p) => p.name === "site")?.modules ?? []),
]);
const sitePrunedClaims = m.modules
  .filter((mod) => !SITE_MODULES.has(mod.slug))
  .flatMap((mod) => claimsOf(mod.slug));

/**
 * A claim path → the route it serves. `app/[locale]/priser` → `/priser`,
 * `app/manifest` → `/manifest`. Dynamic segments, route groups, API routes and
 * plain files contribute nothing — they are not link targets a human writes.
 */
function routeOf(claim: string): string | null {
  let rel: string | null = null;
  if (claim.startsWith("app/[locale]/")) rel = `/${claim.slice("app/[locale]/".length)}`;
  else if (claim.startsWith("app/") && !claim.startsWith("app/api/")) rel = `/${claim.slice(4)}`;
  if (!rel) return null;
  rel = rel.replace(/\/(page|route|layout|default)\.tsx?$/, "");
  if (!rel.startsWith("/") || rel === "/") return null;
  if (rel.includes("[") || rel.includes("(") || rel.includes(".")) return null;
  return rel;
}

const routesFrom = (claims: readonly string[]) =>
  [...new Set(claims.map(routeOf).filter((r): r is string => r !== null))].sort();

/** Route names the ledger removes from EVERY profile. */
const ENGINE_ONLY_ROUTES = routesFrom(engineOnlyPaths);
/** Route names the `trust-pages` module removes from a `site` scaffold. */
const TRUST_ROUTES = routesFrom(claimsOf("trust-pages"));

type Obligation = {
  capability: string;
  routes: string[];
  source: string;
  /**
   * Files that cannot produce a dead link for this obligation, because the
   * same profile that removes the ROUTE also removes the FILE.
   */
  exempt: (file: string) => boolean;
};

const GATED: Obligation[] = [
  {
    capability: "engineMarketing",
    routes: ENGINE_ONLY_ROUTES,
    source: "scaffold/engine-only.ts → ENGINE_ONLY",
    // Every profile deletes ENGINE_ONLY and keeps everything else, so only the
    // ledger's own files are exempt.
    exempt: (file) => isClaimedBy(file, engineOnlyPaths),
  },
  {
    capability: "trustPages",
    routes: TRUST_ROUTES,
    source: 'modules/registry.ts → the "trust-pages" module',
    // `site` is the only profile without the module, so a file `site` itself
    // removes (a webshop-only design pack, say) can link the pages freely.
    exempt: (file) =>
      isClaimedBy(file, engineOnlyPaths) || isClaimedBy(file, sitePrunedClaims),
  },
];

/**
 * The standing debt, route by route, with why it is not a capability yet.
 * A pruned route that is NOT here and IS linked from shipped code fails.
 */
const KNOWN_UNGATED: Record<string, string> = {
  "/contact":
    "the contact-form module is included by default in every profile today (`--with none` opts out); the owner's 2026-09-07 decision to make it opt-in is a CLI change (B4) and takes its own capability with it.",
  "/info":
    "NOT SAFE, and not this PR's to fix: the route is a seam target rather than a pruned one (`pages-db` claims the directory, core ships `app/[locale]/info/[slug]/page.static.tsx`, so `/info/terms` and `/info/cookies` answer in every profile) — but two of the hits this entry absorbs link BARE `/info`, which no profile serves at all. There is no `app/[locale]/info/page.tsx`; measured on a materialized site scaffold, `/info` → 307 → 404 and `/da/info` → 404. Standing debt in `designs/stack/homepage.tsx` (the two 'Read the docs' CTAs), predating this ledger and unrelated to its routes; retargeting them at `/info/terms` changes a design pack's render and belongs in the W38 sweep with the `/services` links.",
  "/services":
    "gated where the nav is derived (`marketing-pages.ts` declares `requires: \"dbPages\"`), still ungated in the three chrome parts and corporate-baseline — backlog W38 follow-up.",
  "/produkter":
    "webshop routes are hidden by `brand.ecommerceEnabled`, a different mechanism that is false in every site scaffold; converting them to a capability is its own change.",
  "/cart": "same as /produkter — hidden by `brand.ecommerceEnabled`, not by a capability.",
  "/category": "same as /produkter — hidden by `brand.ecommerceEnabled`, not by a capability.",
  "/account":
    "the header already asks `accountAndAdmin` where it matters; the drawer's link is covered by the render-side proof in site-nav-no-dead-links.test.tsx.",
  "/admin":
    "an admin link is never a customer-facing dead link — the surfaces that render it (HeaderClient, WelcomeGuide) ask `accountAndAdmin` or a signed-in session first.",
  "/developers":
    "already asks `profileCapabilities.agentApi` at every call site; it is listed here rather than in GATED because the mcp module owns far more than this one route.",
  "/checkout":
    "not a link: `app/robots.ts` names it in the Disallow list. Telling a crawler to stay away from a path that is not there costs nothing.",
  "/oauth":
    "not a link: `lib/locale-exempt.ts` names it in PROTOCOL_EXEMPT_PREFIXES, a middleware match list. A prefix nothing serves simply never matches.",
};

/** Where the capability comes from — a file that gates a link has to READ it. */
const gateSource = (capability: string) =>
  new RegExp(
    `Boolean\\(profileCapabilities\\.${capability}\\)|requires:\\s*["']${capability}["']`,
  );

/**
 * What a gating line looks like at the point of use. Three shapes, and only
 * three: the capability read itself, the `MARKETING_PAGES` declaration, and the
 * bare binding used as a condition — `cap &&`, `cap ?`, or `cap` at the end of
 * a `...(` spread whose `?` sits on the next line.
 *
 * The trailing context is what keeps this from being a bare word search: a line
 * like `<Link href="/priser" data-test="engineMarketing">` names the capability
 * and gates nothing, and must not pass.
 */
const gateLine = (capability: string) =>
  new RegExp(
    `Boolean\\(profileCapabilities\\.${capability}\\)` +
      `|requires:\\s*["']${capability}["']` +
      `|\\b${capability}\\b\\s*(?:&&|\\?|\\)\\s*$|$)`,
  );

/**
 * Lines that name a route but cannot produce a dead link. `revalidatePath` is
 * a cache instruction, not a hyperlink: it is a no-op for a route that is not
 * there, and the admin actions that call it ship in profiles where the route
 * genuinely does not exist.
 */
const NOT_A_LINK = /revalidatePath\s*\(|^\s*import\s|require\s*\(|path\.(join|resolve)\s*\(/;

/**
 * A line that ADVERTISES the route: it carries the route as a path — preceded
 * by a quote, a backtick, `=` or the `}` that closes a `${locale}`
 * interpolation, optionally with ONE hardcoded locale segment in between — and
 * ended at a word boundary.
 *
 * Deliberately NOT limited to lines containing `href`. The measured surfaces
 * that advertise a route to a crawler or an agent do not use `href` at all
 * (`app/sitemap.ts`, `app/sitemap.static.ts`, `app/llms.txt/route.ts`,
 * `app/api/mcp/route.ts`, `.well-known/ai-catalog.json`), and neither does the
 * indirection form a reviewer flagged — `const CHANGELOG = "/changelog"`
 * followed by `href={CHANGELOG}`, which an href-only sweep cannot see.
 *
 * THREE BOUNDARIES, EACH EARNING ITS KEEP:
 *
 *  - the right one keeps `/cartwright.png` and `/cartwright_logo.png` (image
 *    assets in the saas-dark pack) from reading as links to `/cartwright`;
 *  - the left one keeps `href="https://github.com/Teloz1870/cartwright/blob/…"`
 *    — a link to our source, which every profile may keep — from reading as one;
 *  - the optional `/xx` segment closes the third form, which the first version
 *    of this file could not see at all: `href="/da/privacy"`. A falsifier
 *    mutated a `<Link href="/da/privacy">` into the tree and this suite stayed
 *    green, while the `` /${locale}/privacy `` spelling of the same link went
 *    red. No such href exists in the tree today, so this is a hole in a new
 *    guard rather than a live defect — but the whole point of the guard is that
 *    a link's SPELLING must not decide whether it is checked.
 *
 * The locale segment is matched generically (two letters, optionally
 * `-XX`) rather than against `i18n/routing.ts`: this sweep protects files that
 * ship to customers whose locale set is not ours, and over-matching here costs
 * at most an entry in `KNOWN_UNGATED`, while under-matching costs a 404 on
 * someone's domain.
 */
const LOCALE_SEG = "(?:\\/[a-z]{2}(?:-[A-Za-z]{2})?)?";

function advertisesRoute(line: string, route: string): boolean {
  if (NOT_A_LINK.test(line)) return false;
  const escaped = route.replace(/[/]/g, "\\/");
  return new RegExp(`["'\`}=]${LOCALE_SEG}${escaped}(?![\\w.-])`).test(line);
}

const indentOf = (line: string) => line.length - line.trimStart().length;

/**
 * Is this hit gated? Either the line itself carries the capability, or an
 * enclosing line does — found by walking up while tracking the deepest indent
 * an ANCESTOR may have. A block that has already closed above the hit is a
 * sibling, not an ancestor, so its closing line lowers that bound and its gate
 * cannot be inherited (the mutation this rule exists for is at the bottom of
 * this file). Module scope (indent 0) is not an ancestor: the whole point of
 * the per-link rule is that `const engineMarketing = …` at the top of a file
 * does not gate the file.
 */
function hitIsGated(lines: string[], index: number, capability: string): boolean {
  const GATE = gateLine(capability);
  if (GATE.test(lines[index])) return true;
  let maxIndent = indentOf(lines[index]) - 1;
  for (let i = index - 1; i >= 0; i--) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    const indent = indentOf(line);
    if (indent === 0) break;
    // Tested BEFORE the closer adjustment: `) : trustPages ? (` both closes a
    // branch and opens the next one, and it is the gate for what follows.
    if (indent <= maxIndent && GATE.test(line)) return true;
    if (/^[)}\]]|^<\//.test(trimmed)) maxIndent = Math.min(maxIndent, indent - 1);
  }
  return false;
}

function allShippedFiles(): string[] {
  const roots = [
    ...SHIPPED_ROOTS,
    ...readdirSync(REPO_ROOT).filter(
      (f) => CODE_EXT.test(f) && statSync(path.join(REPO_ROOT, f)).isFile(),
    ),
  ];
  return roots.flatMap((r) => walkCode(r));
}

const SHIPPED = allShippedFiles();
const sourceOf = new Map<string, string[]>(
  SHIPPED.map((f) => [f, stripComments(readFileSync(path.join(REPO_ROOT, f), "utf8")).split("\n")]),
);

type Hit = { file: string; line: number; route: string; text: string };

function hits(routes: readonly string[], files: readonly string[]): Hit[] {
  const out: Hit[] = [];
  for (const file of files) {
    sourceOf.get(file)!.forEach((line, i) => {
      for (const route of routes) {
        if (advertisesRoute(line, route)) {
          out.push({ file, line: i + 1, route, text: line.trim().slice(0, 100) });
        }
      }
    });
  }
  return out;
}

describe.skipIf(!isEngineCheckout)("routes a profile prunes are never linked from shipped code", () => {
  it("derives the route names from the ledger and the module registry, not a hand-written list", () => {
    expect(ENGINE_ONLY_ROUTES).toEqual(
      expect.arrayContaining([
        "/cartwright",
        "/priser",
        "/cases",
        "/start",
        "/changelog",
        "/built-with-cartwright",
        "/manifest",
      ]),
    );
    // The half the first version missed. If the trust-pages module ever stops
    // claiming routes, this fails rather than silently sweeping nothing.
    expect(TRUST_ROUTES).toEqual(["/about", "/privacy"]);
  });

  for (const ob of GATED) {
    it(`every link to a route ${ob.capability} answers for is gated on it`, () => {
      const files = SHIPPED.filter((f) => !ob.exempt(f));
      const offenders = hits(ob.routes, files)
        .filter((h) => {
          const lines = sourceOf.get(h.file)!;
          return !(hitIsGated(lines, h.line - 1, ob.capability) &&
            gateSource(ob.capability).test(lines.join("\n")));
        })
        .map((h) => `${h.file}:${h.line} → ${h.route}   ${h.text}`);
      expect(
        offenders,
        `these files link a route the CLI removes (${ob.source}), without asking whether ` +
          `this profile has it:\n${offenders.join("\n")}\n\n` +
          `Gate the link with Boolean(profileCapabilities.${ob.capability}) — never \`=== true\`.`,
      ).toEqual([]);
    });
  }

  it("the standing debt is pinned: no NEW pruned route is linked from shipped code", () => {
    // Everything the site profile removes that is not one of the two
    // capabilities above. This is the ratchet: the list may shrink freely, and
    // a route joining it fails by name.
    const gatedRoutes = new Set(GATED.flatMap((o) => o.routes));
    const prunedRoutes = routesFrom(sitePrunedClaims).filter((r) => !gatedRoutes.has(r));
    const files = SHIPPED.filter(
      (f) => !isClaimedBy(f, engineOnlyPaths) && !isClaimedBy(f, sitePrunedClaims),
    );
    const linked = [...new Set(hits(prunedRoutes, files).map((h) => h.route))].sort();
    const unexpected = linked.filter((r) => !(r in KNOWN_UNGATED));
    expect(
      unexpected,
      `a shipped file links a route the site profile removes, and nothing gates it:\n` +
        unexpected
          .map((r) =>
            hits([r], files)
              .map((h) => `  ${r} ← ${h.file}:${h.line}`)
              .join("\n"),
          )
          .join("\n") +
        `\n\nEither gate it on a profileCapabilities key (add it to GATED above) or, if the ` +
        `link is safe, add the route to KNOWN_UNGATED with the reason it is safe.`,
    ).toEqual([]);
    // Not vacuous: if the sweep broke, `linked` would be empty and this would
    // pass for the wrong reason.
    expect(linked.length, "the ratchet found nothing at all — the sweep is broken").toBeGreaterThan(
      4,
    );
  });

  it("the sweep can fail: a bare link to a pruned route in an ungated file is caught", () => {
    // Without this, the sweeps above would pass just as happily if
    // `advertisesRoute` never matched anything.
    expect(advertisesRoute('  <a href="/priser">Priser</a>', "/priser")).toBe(true);
    expect(advertisesRoute("  href={`/${locale}/changelog`}", "/changelog")).toBe(true);
    expect(advertisesRoute("  href={`${home}/about`}", "/about")).toBe(true);
    // …and the hardcoded-locale spelling of the same link, which the first
    // version of this sweep could not see (a mutated `<Link href="/da/privacy">`
    // left the suite green).
    expect(advertisesRoute('  <Link href="/da/privacy">Privatliv</Link>', "/privacy")).toBe(true);
    expect(advertisesRoute('  <a href="/en/cases">Cases</a>', "/cases")).toBe(true);
    expect(advertisesRoute('  <a href="/en-GB/priser">Pricing</a>', "/priser")).toBe(true);
    // One segment, not a path prefix: a route nested under something else is a
    // different route, and must not be reported as this one.
    expect(advertisesRoute('  <a href="/docs/guide/cases">Cases</a>', "/cases")).toBe(false);
    // The indirection an href-only sweep could not see.
    expect(advertisesRoute('  const CHANGELOG = "/changelog";', "/changelog")).toBe(true);
    // …and the sitemap/llms shape, which never writes `href` at all.
    expect(advertisesRoute("    url: `${baseUrl}/${locale}/privacy`,", "/privacy")).toBe(true);
    // …and the two asset paths that must NOT read as links to /cartwright.
    expect(advertisesRoute('  <img src="/cartwright.png" />', "/cartwright")).toBe(false);
    expect(advertisesRoute('  <img src="/cartwright_logo.png" />', "/cartwright")).toBe(false);
    // A route name in prose is not a link (comments are stripped before this
    // runs; the check here is that the pattern needs a path boundary).
    expect(advertisesRoute("  see /priser for the pricing page", "/priser")).toBe(false);
    // …nor is our own source URL, which a customer's repo may legitimately link.
    expect(
      advertisesRoute('href="https://github.com/Teloz1870/cartwright/blob/main/x.md"', "/cartwright"),
    ).toBe(false);
    // …nor a cache instruction: a route that is gone is simply not revalidated.
    expect(advertisesRoute('  revalidatePath("/changelog");', "/changelog")).toBe(false);
  });

  it("a capability named on a line that gates nothing does not count", () => {
    // The cheap version of `gateLine` was a bare word search, which a data
    // attribute or a string containing the name would satisfy.
    expect(gateLine("engineMarketing").test('  <Link href="/priser" data-x="engineMarketing">')).toBe(
      false,
    );
    expect(gateLine("engineMarketing").test("  {engineMarketing && (")).toBe(true);
    expect(gateLine("trustPages").test("  {trustPages ? <Link /> : null}")).toBe(true);
    expect(gateLine("trustPages").test("    ...(trustPages")).toBe(true);
    expect(
      gateLine("engineMarketing").test("  ...(Boolean(profileCapabilities.engineMarketing)"),
    ).toBe(true);
  });

  it("comment stripping keeps the file's real line numbers", () => {
    // A multi-line docblock used to collapse to nothing, so every offender
    // below it was reported at the wrong line — a reviewer's first move is to
    // open that line.
    const src = ["/**", " * a", " * b", " */", 'const x = "/priser";'].join("\n");
    expect(stripComments(src).split("\n")).toHaveLength(5);
    expect(stripComments(src).split("\n")[4]).toContain("/priser");
  });

  it("the gated files really are gated (the sweep is not vacuous)", () => {
    // If every shipped file stopped linking these routes, the sweeps would pass
    // for the wrong reason. Name the surfaces that DO link them today.
    const gated: Record<string, string[]> = {
      engineMarketing: [
        "components/nav/marketing-pages.ts",
        "components/Footer.tsx",
        "components/Footer.static.tsx",
        "components/AnnouncementBar.tsx",
        "components/first-run/WelcomeCanvas.tsx",
        "designs/saas-dark/homepage.tsx",
        "designs/corporate-baseline/homepage.tsx",
        "app/sitemap.ts",
        "app/llms.txt/route.ts",
        "app/api/mcp/route.ts",
      ],
      trustPages: [
        "components/Footer.tsx",
        "components/Footer.static.tsx",
        "components/chrome-parts/MegaFooter.tsx",
        "components/chrome-parts/SlimFooter.tsx",
        "components/ConsentBanner.tsx",
        "components/TrustBadges.tsx",
        "designs/agentic-showcase/chrome.tsx",
        "designs/agentic-showcase/homepage.tsx",
        "app/sitemap.static.ts",
      ],
    };
    for (const [capability, files] of Object.entries(gated)) {
      const routes = GATED.find((o) => o.capability === capability)!.routes;
      for (const file of files) {
        const src = readFileSync(path.join(REPO_ROOT, file), "utf8");
        expect(gateSource(capability).test(src), `${file} no longer reads ${capability}`).toBe(true);
        expect(
          src,
          `${file}: compare with Boolean(), not === true — the static twin is \`as const\` false (TS2367)`,
        ).not.toMatch(new RegExp(`profileCapabilities\\.${capability}\\s*[=!]==`));
        const links = sourceOf
          .get(file)!
          .some((line) => routes.some((route) => advertisesRoute(line, route)));
        expect(links, `${file} no longer links a ${capability} route — drop it from this list`).toBe(
          true,
        );
      }
    }
  });

  it("the per-link rule beats the per-file one: a second, ungated link in a gated file fails", () => {
    // The mutation this test exists for. Footer.static.tsx already gates its
    // `/built-with-cartwright` links, so a file-level "does it mention the
    // capability" check would wave through a `/priser` link dropped into the
    // trust column — a dead link in the customer's footer, in a file the
    // checker had already declared clean.
    const lines = [
      "  {engineMarketing && (",
      '    <Link href="/built-with-cartwright">Cartwright</Link>',
      "  )}",
      "  <ul>",
      "    <li>",
      '      <Link href="/priser">Priser</Link>',
      "    </li>",
      "  </ul>",
    ];
    expect(hitIsGated(lines, 1, "engineMarketing"), "the real link is inside the conditional").toBe(
      true,
    );
    expect(hitIsGated(lines, 5, "engineMarketing"), "the smuggled one is not").toBe(false);
  });

  it("a branch that closes and re-opens on one line still gates what follows", () => {
    // `) : trustPages ? (` is both a closer and the next branch's opener. The
    // naive closer rule dropped the indent bound before reading the line and
    // reported a correctly gated link as an offender.
    const lines = [
      "            {agentApi ? (",
      "              <Link href={`${home}/developers`}>Docs</Link>",
      "            ) : trustPages ? (",
      "              <Link href={`${home}/about`}>About</Link>",
      "            ) : null}",
    ];
    expect(hitIsGated(lines, 3, "trustPages")).toBe(true);
  });
});
