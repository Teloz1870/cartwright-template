// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import manifest from "../../scaffold/manifest.json";
import { ENGINE_ONLY } from "@/scaffold/engine-only";
import { stripComments } from "../helpers/claims";

/**
 * A `--profile site` scaffold's own header linked two routes the materializer
 * had removed: `/services` (owned by `pages-db`) and, from the drawer only,
 * `/account` (owned by `auth`). Measured on a real `create-cartwright@2.9.3
 * --profile site` scaffold: 11 `/en/*` links in the chrome, 9 → 200, those two
 * → 404 (the desktop header already gated `/account` on `ecommerceEnabled`;
 * the drawer rendered it unconditionally).
 *
 * `components/nav/marketing-pages.ts` and `components/MobileMenu.tsx` are
 * unclaimed, so they ship in EVERY profile — the nav cannot assume the route
 * set of the engine tree. This file pins both halves of the fix:
 *
 *  - render: with the static profile's capabilities, neither link is emitted,
 *    and the links whose pages DO ship still are;
 *  - invariant: any marketing entry whose page belongs to a module the site
 *    profile excludes must declare a `requires` capability that the static
 *    twin turns off. That obligation is derived from `scaffold/manifest.json`,
 *    so a future entry cannot forget it.
 */

/**
 * The materializer's own substitution, done in the test runner: the site
 * profile replaces `lib/profile-capabilities.ts` with `.static.ts`, so the
 * mock IS that file rather than a hand-copied object. A copy would drift the
 * first time a capability is added to the twin and not to the copy, and the
 * suite would then prove something about a profile nobody ships.
 */
vi.mock("@/lib/profile-capabilities", async () =>
  vi.importActual<typeof import("@/lib/profile-capabilities.static")>(
    "@/lib/profile-capabilities.static",
  ),
);

vi.mock("next-intl", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  return { ...actual, useTranslations: (ns: string) => (key: string) => `${ns}.${key}` };
});
vi.mock("@/i18n/routing", () => ({
  Link: ({ href, children, ...rest }: { href: string; children?: React.ReactNode; className?: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock("@/brand.config", () => ({ brand: { uiLabels: { allProductsLink: "All products" } } }));
vi.mock("@/lib/features", () => ({ supportsDialog: () => true }));
vi.mock("@/lib/feature-flags/context", () => ({ useFeature: () => true }));
vi.mock("@/components/Logo", () => ({ default: () => <span /> }));
vi.mock("@/components/CartwrightLogo", () => ({ CartwrightLogo: () => <span /> }));
vi.mock("@/components/SearchBox", () => ({ default: () => <span /> }));
vi.mock("@/components/NavLink", () => ({
  default: ({ href, children }: { href: string; children?: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/LanguageSwitcher", () => ({ default: () => <span /> }));
vi.mock("@/components/CurrencySwitcher", () => ({ default: () => <span /> }));

const { default: HeaderClient } = await import("@/components/HeaderClient");
const { MARKETING_PAGES, VISIBLE_MARKETING_PAGES } = await import("@/components/nav/marketing-pages");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ROOT = path.join(__dirname, "..", "..");

type Manifest = {
  modules: { slug: string; files: (string | { path: string })[] }[];
  profiles: { name: string; modules: string[] }[];
};
const m = manifest as unknown as Manifest;
const filesOf = (slug: string) =>
  m.modules.find((x) => x.slug === slug)!.files.map((f) => (typeof f === "string" ? f : f.path));

/**
 * Both route shapes plus the per-file one: `/services` lives at
 * `app/[locale]/services`, `/admin` at `app/admin`, and a plugin-owned route
 * like `/blog` is claimed as `app/[locale]/blog/page.tsx` rather than as the
 * directory. Without the third shape a future `{ href: "/blog" }` would resolve
 * to "unclaimed", be read as shipping everywhere, and be waved through with no
 * `requires` — the same hole one level down.
 */
function routeCandidates(href: string): string[] {
  if (href.startsWith("/api")) return [`app${href}`];
  return [`app/[locale]${href}`, `app${href}`, `app/[locale]${href}/page.tsx`];
}

/** Engine-only paths, from the ledger the CLI reads. */
const ENGINE_ONLY_PATHS = ENGINE_ONLY.map((e) => e.path);

/**
 * The module that claims a path, the sentinel `"engine-only"` when the ledger
 * says no customer gets it, or null when nothing does (it ships everywhere).
 *
 * The sentinel matters: `/cases` and `/priser` are claimed by NO module, so
 * before the ledger they read as "ships everywhere" and needed no `requires` —
 * which is exactly why they were still in the nav of a scaffold that had
 * deleted them.
 */
function claimingModule(target: string): string | null {
  for (const f of ENGINE_ONLY_PATHS) {
    if (target === f || target.startsWith(`${f.replace(/\/$/, "")}/`)) return "engine-only";
  }
  for (const mod of m.modules) {
    for (const f of filesOf(mod.slug)) {
      if (target === f || target.startsWith(`${f.replace(/\/$/, "")}/`)) return mod.slug;
    }
  }
  return null;
}

async function renderWebsiteSaasHeader() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <HeaderClient
        categories={[]}
        cartCount={0}
        signedIn={false}
        storeName="Teloz"
        allProductsLabel="Alle produkter"
        ecommerceEnabled={false}
        industryTemplate="saas"
        navPages={[]}
        darkChrome={false}
      />,
    );
  });
  const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
  act(() => root.unmount());
  container.remove();
  return hrefs;
}

const SITE_MODULES = new Set(["core", ...m.profiles.find((p) => p.name === "site")!.modules]);

describe("a site scaffold's chrome links no route the profile removed", () => {
  it("renders NO link whose route belongs to a module this profile lacks", async () => {
    // The class, not the two instances: every internal href the chrome emits
    // is resolved to its owning module through the manifest, and a module the
    // site profile does not have is a 404 waiting for a visitor. `/services`
    // (pages-db) and `/account` (auth) were the two measured on a real 2.9.4
    // scaffold; a future hardcoded link fails here without anyone remembering.
    const hrefs = await renderWebsiteSaasHeader();
    const dead = hrefs
      .filter((h): h is string => Boolean(h?.startsWith("/")))
      .map((href) => ({
        href,
        owner: routeCandidates(href).map(claimingModule).find((o) => o !== null) ?? null,
      }))
      .filter((x) => x.owner !== null && !SITE_MODULES.has(x.owner));
    expect(dead, `the chrome links routes this profile removed: ${JSON.stringify(dead)}`).toEqual([]);
    // Belt and braces on the two that were actually measured.
    expect(hrefs).not.toContain("/services");
    expect(hrefs).not.toContain("/account");
  });

  it("the gate is Boolean(), never `=== true` — an equality comparison does not compile in the scaffold", () => {
    // The static twin is `as const` with every value literal `false`, so
    // `profileCapabilities[k] === true` is TS2367 in a materialised site
    // scaffold: `pnpm typecheck` and `next build` fail there while lint, tsc,
    // the suite, the build and the import audit all pass in the engine, whose
    // own copy is all-`true`. Found by a falsifier that built a real scaffold.
    const src = readFileSync(path.join(ROOT, "components", "nav", "marketing-pages.ts"), "utf8");
    expect(src, "compare capabilities with Boolean(), not === true").not.toMatch(
      /profileCapabilities\[[^\]]+\]\s*[=!]==/,
    );
    expect(src).toMatch(/Boolean\(profileCapabilities\[/);
  });

  it("resolves ownership at all — a manifest that stopped listing route directories would silence the sweep", () => {
    // The check above is only as good as claimingModule(); if the manifest ever
    // listed `…/page.tsx` instead of the directory, every lookup would return
    // null and the sweep would pass while the chrome linked 404s.
    expect(claimingModule("app/[locale]/services")).toBe("pages-db");
    expect(claimingModule("app/[locale]/account")).toBe("auth");
    expect(
      claimingModule("app/[locale]/cases"),
      "no module claims it — the ledger is what says it is ours",
    ).toBe("engine-only");
    expect(claimingModule("app/admin"), "the non-locale shape must resolve too").toBe("admin");
    // The per-file shape: the blog plugin claims `…/blog/page.tsx`, not the
    // directory, so only the third candidate resolves it.
    expect(claimingModule("app/[locale]/blog/page.tsx")).toBe("blog");
  });

  it("renders none of the engine-marketing links under static capabilities", async () => {
    // `/cases`, `/priser` and `/cartwright` are Cartwright's own pages
    // (`scaffold/engine-only.ts`), removed from a customer's scaffold. Under
    // the static twin the nav must be empty of all three — the whole point of
    // the ledger is that "no module claims it" stopped meaning "it ships".
    const hrefs = await renderWebsiteSaasHeader();
    for (const href of ["/cases", "/priser", "/cartwright"]) {
      expect(hrefs, `${href} is engine-only and must not appear in a scaffold's nav`).not.toContain(
        href,
      );
    }
  });

  it("VISIBLE_MARKETING_PAGES drops exactly the entries whose capability is off", () => {
    // Every entry is now gated: `/services` on dbPages, the other three on
    // engineMarketing — so the static profile's nav carries no marketing links
    // at all, and the engine's (all-true) carries all four.
    expect(VISIBLE_MARKETING_PAGES.map((p) => p.href)).toEqual([]);
    expect(MARKETING_PAGES.map((p) => p.href)).toEqual([
      "/services",
      "/cases",
      "/priser",
      "/cartwright",
    ]);
  });

  it("no profile can hold a route whose capability the seam's provider would switch off", () => {
    // `lib/profile-capabilities.ts` is one seam with one provider (`mcp`), but
    // it now answers for four modules. That is sound only while every profile
    // holding `pages-db`, `auth` or `admin` also holds `mcp` — otherwise such a
    // profile reads the static twin and HIDES a route it actually ships (safe
    // direction, but wrong). Backlog W8 moves the seam; this is the tripwire.
    for (const profile of m.profiles) {
      const modules = new Set(["core", ...profile.modules]);
      for (const owner of ["pages-db", "auth", "admin"]) {
        if (modules.has(owner)) {
          expect(
            modules.has("mcp"),
            `profile "${profile.name}" has ${owner} but not mcp — it would read the static capabilities and hide its own routes`,
          ).toBe(true);
        }
      }
    }
  });

  it("every marketing entry whose page a profile prunes declares a capability the static twin turns off", () => {
    const siteModules = SITE_MODULES;
    const twin = readFileSync(path.join(ROOT, "lib", "profile-capabilities.static.ts"), "utf8");
    for (const page of MARKETING_PAGES) {
      // Both shapes — an entry pointing at /admin (app/admin, the admin module)
      // resolved to "unclaimed" and was waved through when only the locale
      // shape was probed.
      const owner = routeCandidates(page.href).map(claimingModule).find((o) => o !== null) ?? null;
      const shipsInSite = owner === null || siteModules.has(owner);
      if (shipsInSite) continue;
      expect(
        page.requires,
        `${page.href} is owned by the "${owner}" module, which a site scaffold does not have — declare a \`requires\` capability or the nav links a 404`,
      ).toBeTruthy();
      expect(
        new RegExp(`${page.requires}:\\s*false`).test(twin),
        `${page.href} requires "${page.requires}", but lib/profile-capabilities.static.ts does not set it false`,
      ).toBe(true);
    }
  });
});

/**
 * The chrome was only half the surface. `app/sitemap.static.ts` — the site
 * profile's sitemap — listed `/about` and `/privacy` for every locale
 * unconditionally, so a scaffold that never had those pages still advertised
 * four trust URLs to crawlers (owner CW-24, our W39). A sitemap entry for a
 * page that is gone is a 404 you published, which is worse than a missing link.
 *
 * Derived, not listed: the routes come out of the `trust-pages` module's own
 * claims, so moving a page into or out of that module re-aims this test.
 * Skipped in a materialised scaffold, where the seam has already collapsed
 * `sitemap.static.ts` into `sitemap.ts`.
 */
describe.skipIf(!existsSync(path.join(ROOT, "app", "sitemap.static.ts")))(
  "the site sitemap advertises no route the profile removed",
  () => {
    const src = readFileSync(path.join(ROOT, "app", "sitemap.static.ts"), "utf8");
    /** `app/[locale]/about` → `about`, from the module registry. */
    const trustSegments = filesOf("trust-pages")
      .map((f) => f.replace(/^app\/\[locale\]\//, ""))
      .filter((f) => !f.includes("/"));

    it("names the pages the trust-pages module owns", () => {
      // Vacuity guard: if the module stopped claiming routes, the sweep below
      // would pass by having nothing to check.
      expect(trustSegments.sort()).toEqual(["about", "privacy"]);
    });

    it("never advertises a trust URL unconditionally", () => {
      // TWO MECHANISMS, ONE OBLIGATION. This PR gates the entries on
      // `profileCapabilities.trustPages` (the module is opt-in, so the
      // capability is what a scaffold reads). The sibling site-sitemap PR
      // gates them on `localeRouteExists(...)` — whether the page file
      // physically ships — which is STRICTLY STRONGER: it also catches a page
      // the owner deleted by hand, and it stays right under
      // `--with trust-pages`. If both land, the file-existence form wins and
      // the capability gate is redundant; this test accepts either so neither
      // PR turns the other red for the wrong reason.
      //
      // What it will NOT accept is an unconditional entry — the measured
      // defect (four trust URLs advertised by a scaffold that served none).
      // Comments stripped FIRST. Both probes ask "does this file DO x?", and
      // the docblock right above the gate NAMES both mechanisms — so on the
      // raw text, deleting the capability gate left `usesFileExistence` true
      // (from the comment), `usesCapability` false, and the early return below
      // skipped every assertion. The guard passed with four unconditional
      // trust URLs, which is the exact defect it exists to catch.
      const code = stripComments(src);
      const usesCapability = code.includes("Boolean(profileCapabilities.trustPages)");
      const usesFileExistence = /localeRouteExists\s*\(/.test(code);
      expect(
        usesCapability || usesFileExistence,
        "app/sitemap.static.ts gates its trust URLs on nothing — a scaffold without the pages would advertise 404s (owner CW-24 / W39)",
      ).toBe(true);

      if (!usesCapability) return; // the file-existence form; its own suite pins it.

      const gated = code.match(/trustPages\s*\?\s*\[([\s\S]*?)\]\s*:\s*\[\]/);
      expect(gated, "the capability is read but nothing is gated on it").toBeTruthy();
      for (const seg of trustSegments) {
        const needle = `/\${locale}/${seg}`;
        const total = code.split(needle).length - 1;
        const inside = gated![1].split(needle).length - 1;
        expect(total, `sitemap.static.ts never lists /${seg} — the engine's sitemap lost a page`)
          .toBeGreaterThan(0);
        expect(
          inside,
          `sitemap.static.ts lists /${seg} outside the trustPages gate — a site scaffold without the module would advertise a 404`,
        ).toBe(total);
      }
    });
  },
);
