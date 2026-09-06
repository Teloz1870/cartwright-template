// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import manifest from "../../scaffold/manifest.json";

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

vi.mock("@/lib/profile-capabilities", () => ({
  // Exactly what `lib/profile-capabilities.static.ts` ships.
  profileCapabilities: {
    agentApi: false,
    accountAndAdmin: false,
    supportTriage: false,
    dbPages: false,
    publicFeatureKeys: [] as readonly string[],
  },
}));

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

/** Both route shapes: `/services` lives at app/[locale]/services, `/admin` at app/admin. */
function routeCandidates(href: string): string[] {
  return href.startsWith("/api") ? [`app${href}`] : [`app/[locale]${href}`, `app${href}`];
}

/** The module that claims a path, or null when nothing does (it ships everywhere). */
function claimingModule(target: string): string | null {
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
    expect(claimingModule("app/[locale]/cases")).toBeNull();
    expect(claimingModule("app/admin"), "the non-locale shape must resolve too").toBe("admin");
  });

  it("still renders the marketing links whose pages do ship", async () => {
    const hrefs = await renderWebsiteSaasHeader();
    for (const href of ["/cases", "/priser", "/cartwright"]) {
      expect(hrefs, `${href} ships in every profile and must stay in the nav`).toContain(href);
    }
    // Two halves, one nav: each surviving link is still rendered twice.
    for (const href of ["/cases", "/priser"]) {
      expect(hrefs.filter((h) => h === href).length, `${href} rendered ${hrefs.filter((h) => h === href).length}x`).toBe(2);
    }
  });

  it("VISIBLE_MARKETING_PAGES drops exactly the entries whose capability is off", () => {
    expect(VISIBLE_MARKETING_PAGES.map((p) => p.href)).toEqual(["/cases", "/priser", "/cartwright"]);
    expect(MARKETING_PAGES.map((p) => p.href)).toContain("/services");
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
