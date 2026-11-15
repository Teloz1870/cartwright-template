import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
// The real request/response classes, not the minimal tests/shims/next-server.ts:
// next-intl's middleware runs for real behind proxy.ts below.
import { NextRequest } from "next/dist/server/web/spec-extension/request";
import { NextResponse } from "next/dist/server/web/spec-extension/response";

import { REPO_ROOT, stripComments } from "../helpers/claims";

/**
 * URL2-c — the links the engine used to write by hand (`/${locale}/contact`)
 * go through lib/urls.ts, so on a shop with `urls.trailingSlash` or
 * `urls.localePrefix: "never"` they answer directly instead of taking a 308.
 *
 * Pinned here:
 *  1. Both footers, the trust badges the db footer renders (and the product,
 *     category, checkout and homepage), the cookie banner on every page, the
 *     announcement bar and the not-found page: every internal href they
 *     render is, with `brand.urls` unset, the SAME string the old literal
 *     produced (every canary renders byte-identically), and with either
 *     option on, a fixed point of the proxy — proxy.ts, with next-intl's real
 *     middleware behind it, serves each one where it points.
 *  2. The visible breadcrumbs and their BreadcrumbList steps: the pages build
 *     them with `localeHref` (no `/${locale}` literal left), whose output is the
 *     old literal by default and the served form with the options on; the
 *     Service JSON-LD is checked end to end.
 *  3. The catch-all 404 (an address no route matches): its recovery links, the
 *     same two ways.
 *
 * Every brand value a row depends on is set by the row (locales included), so
 * the file holds in a scaffold whose own brand.config differs — an en-only
 * scaffold, for one. A file the scaffold's profile removed is skipped.
 */

const ORIGIN = "https://shop.example";
const L = "da";

type Patch = Record<string, unknown>;
const DEFAULTS: Patch = { locales: ["da", "en"], defaultLocale: L, urls: undefined };
const SLASH: Patch = { locales: ["da", "en"], defaultLocale: L, urls: { trailingSlash: true } };
const NEVER: Patch = { locales: ["da"], defaultLocale: L, urls: { localePrefix: "never" } };
const NEVER_SLASH: Patch = {
  locales: ["da"],
  defaultLocale: L,
  urls: { localePrefix: "never", trailingSlash: true },
};
/** Every way of leaving the block at its defaults — each must render the old strings. */
const DEFAULT_VARIANTS: Patch[] = [
  DEFAULTS,
  { ...DEFAULTS, urls: {} },
  { ...DEFAULTS, urls: { permalinks: false, trailingSlash: false, localePrefix: "always" } },
];
const OPTIONS: [string, Patch][] = [
  ["trailingSlash", SLASH],
  ['localePrefix: "never"', NEVER],
  ['localePrefix: "never" + trailingSlash', NEVER_SLASH],
];

const has = (file: string) => existsSync(path.join(REPO_ROOT, file));

async function mockBrand(patch: Patch) {
  const actual = await vi.importActual<typeof import("@/brand.config")>("@/brand.config");
  // The audit-feed link is set here, not left to the config: the announcement
  // bar reads it straight from brand.config, and a scaffold may turn it off.
  const website = { ...actual.brand.website, showAuditFeed: true };
  const brand = { ...actual.brand, ecommerceEnabled: true, website, ...patch };
  vi.doMock("@/brand.config", () => ({ ...actual, brand }));
  return brand;
}

afterEach(() => {
  for (const mod of [
    "@/brand.config",
    "@/lib/brand",
    "@/lib/data-source/brand",
    "@/lib/data-source/nav",
    "@/lib/theme",
    "@/lib/genome/read",
    "@/lib/annotate/server",
    "@/lib/profile-capabilities",
    "@/lib/db",
    "@/components/ConsentProvider",
    "next-intl/server",
    "next/server",
    "next-auth",
    "@/lib/auth.config",
    "@upstash/redis",
    "@upstash/ratelimit",
  ]) {
    vi.doUnmock(mod);
  }
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

/** Every `href` prop in a React element tree, in document order. Nothing is rendered. */
function hrefsIn(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const child of node) hrefsIn(child, out);
  } else if (node && typeof node === "object" && "props" in node) {
    const props = (node as { props: Record<string, unknown> }).props;
    if (typeof props.href === "string") out.push(props.href);
    hrefsIn(props.children, out);
  }
  return out;
}

/** Everything a storefront page needs besides brand.config, stubbed to a full webshop. */
async function mockStorefront(patch: Patch, capabilities: Record<string, boolean> = {}) {
  const brand = await mockBrand(patch);
  vi.doMock("@/lib/brand", () => ({
    getBrand: async () => ({
      ...brand,
      features: {
        ...brand.features,
        genomeResolve: false,
        newsletter: false,
        cartwrightBadge: true,
        mcpPublic: true,
      },
    }),
  }));
  vi.doMock("@/lib/data-source/brand", () => ({ fetchBrandingSettings: async () => null }));
  vi.doMock("@/lib/data-source/nav", () => ({
    fetchNavCategories: async () => [{ slug: "hegn", name: "Hegn" }],
    fetchInfoPages: async () => [{ slug: "faq" }],
  }));
  vi.doMock("@/lib/theme", () => ({ getActiveDesign: async () => null }));
  vi.doMock("@/lib/genome/read", () => ({ readField: async () => "" }));
  vi.doMock("@/lib/annotate/server", () => ({ isAnnotateEditEnabled: async () => false }));
  vi.doMock("@/lib/profile-capabilities", () => ({
    profileCapabilities: {
      agentApi: true,
      accountAndAdmin: true,
      supportTriage: true,
      dbPages: true,
      trustPages: true,
      engineMarketing: true,
      publicFeatureKeys: null,
      ...capabilities,
    },
  }));
  // The announcement bar reads its text from the settings row; none here.
  vi.doMock("@/lib/db", () => ({
    prisma: { brandingSettings: { findUnique: async () => null } },
  }));
  // The cookie banner shows only to a visitor who has not chosen yet.
  vi.doMock("@/components/ConsentProvider", () => ({
    useConsent: () => ({
      consent: { analytics: false, marketing: false },
      decided: false,
      update: () => {},
      acceptAll: () => {},
      rejectAll: () => {},
    }),
  }));
  vi.doMock("next-intl/server", () => ({
    getLocale: async () => L,
    getTranslations: async () => (key: string) => key,
  }));
}

/**
 * How a case is rendered when it is not "the file's default export, called with
 * no props": the file (a case may render one file a second way), its props,
 * the capabilities it is rendered under, and whether it is a client component
 * — which uses hooks, so it is rendered to markup rather than called.
 */
type Case = {
  file?: string;
  props?: Record<string, unknown>;
  capabilities?: Record<string, boolean>;
  client?: boolean;
};
const CASES: Record<string, Case> = {
  // The variant the db footer renders: every badge that links anywhere.
  "components/TrustBadges.tsx": { props: { variant: "footer" } },
  "components/ConsentBanner.tsx": { props: { locale: L }, client: true },
  // A scaffold without the trust-pages module points the banner at the cookie page.
  "components/ConsentBanner.tsx without trust-pages": {
    file: "components/ConsentBanner.tsx",
    props: { locale: L },
    capabilities: { trustPages: false },
    client: true,
  },
};
const fileOf = (name: string) => CASES[name]?.file ?? name;

async function renderedHrefs(name: string, patch: Patch): Promise<string[]> {
  const { props = {}, capabilities, client = false } = CASES[name] ?? {};
  vi.resetModules();
  await mockStorefront(patch, capabilities);
  // By path, not by a literal specifier: a file the scaffold's profile removed
  // is skipped, and must not fail the whole suite at transform time.
  const { default: Page } = (await import(/* @vite-ignore */ path.join(REPO_ROOT, fileOf(name)))) as {
    default: (props: Record<string, unknown>) => unknown;
  };
  let hrefs: string[];
  if (client) {
    // next.config.ts gives Next `trailingSlash` + `skipTrailingSlashRedirect`
    // with `urls.trailingSlash`, and Next defines these two from them: with
    // the second set, <Link> renders the href exactly as handed to it. Unset,
    // it would strip the slash — so the markup shows what the component wrote.
    if ((patch.urls as { trailingSlash?: boolean } | undefined)?.trailingSlash) {
      vi.stubEnv("__NEXT_TRAILING_SLASH", "true");
      vi.stubEnv("__NEXT_MANUAL_TRAILING_SLASH", "true");
    }
    // Loaded after the reset, like the component, so both see one React.
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(createElement(Page as never, props));
    hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  } else {
    hrefs = hrefsIn(await Page(props));
  }
  // Internal links only: the owner and GitHub links point off-site.
  return hrefs.filter((href) => href.startsWith("/"));
}

/**
 * The old source, literal for literal: what each file rendered before URL2-c,
 * with the stubs above (a webshop, one category, a FAQ page, every capability
 * and flag on). Written out as the templates were, so a changed string fails.
 */
const OLD: Record<string, (locale: string) => string[]> = {
  "components/Footer.tsx": (locale) => [
    `/${locale}`,
    `/${locale}/produkter`,
    `/${locale}/category/hegn`,
    `/${locale}/contact`,
    `/${locale}/info/faq`,
    `/${locale}/info/shipping`,
    `/${locale}/info/returns`,
    `/${locale}/about`,
    `/${locale}/info/terms`,
    `/${locale}/privacy`,
    `/${locale}/info/cookies`,
    `/${locale}/contact`,
    `/${locale}/built-with-cartwright`,
    `/${locale}/built-with-cartwright`,
    `/${locale}/changelog`,
    "/sitemap.xml",
    "/robots.txt",
    "/llms.txt",
    `/${locale}/developers`,
    "/api/v1/tools",
    "/api/mcp",
  ],
  "components/Footer.static.tsx": (locale) => [
    `/${locale}`,
    `/${locale}/produkter`,
    `/${locale}/category/hegn`,
    `/${locale}/contact`,
    `/${locale}/info/faq`,
    `/${locale}/about`,
    `/${locale}/info/terms`,
    `/${locale}/privacy`,
    `/${locale}/info/cookies`,
    `/${locale}/contact`,
    `/${locale}/built-with-cartwright`,
    `/${locale}/built-with-cartwright`,
    "/sitemap.xml",
    "/robots.txt",
    "/llms.txt",
  ],
  "app/[locale]/not-found.tsx": (locale) => [
    "/",
    `/${locale}/produkter`,
    "/sitemap.xml",
    "/llms.txt",
    `/${locale}/produkter`,
    `/${locale}/developers`,
  ],
  "components/TrustBadges.tsx": (locale) => [
    `/${locale}/info/shipping`,
    `/${locale}/info/returns`,
    `/${locale}/info/faq`,
    `/${locale}/privacy`,
  ],
  "components/ConsentBanner.tsx": (locale) => [`/${locale}/privacy`],
  "components/ConsentBanner.tsx without trust-pages": (locale) => [`/${locale}/info/cookies`],
  "components/AnnouncementBar.tsx": (locale) => [`/${locale}/changelog`],
};

// ── the proxy every href must already be the target of ─────────────────────────

type Handler = (req: NextRequest) => Promise<Response> | Response;

async function loadProxy(patch: Patch): Promise<Handler> {
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => {});
  const shim = await vi.importActual<Record<string, unknown>>("next/server");
  vi.doMock("next/server", () => ({ ...shim, NextRequest, NextResponse }));
  await mockBrand(patch);
  vi.doMock("next-auth", () => ({ default: () => ({ auth: (handler: unknown) => handler }) }));
  vi.doMock("@/lib/auth.config", () => ({ default: {} }));
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://stub.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "stub-token");
  vi.doMock("@upstash/redis", () => ({ Redis: { fromEnv: () => ({ get: async () => null }) } }));
  vi.doMock("@upstash/ratelimit", () => ({
    Ratelimit: Object.assign(
      class {
        limit = async () => ({ success: true, limit: 20, remaining: 19, reset: Date.now() + 10_000 });
      },
      { slidingWindow: () => ({}) },
    ),
  }));
  // next-intl reads Next's trailingSlash from this variable, which its plugin
  // sets from next.config.ts at build.
  if ((patch.urls as { trailingSlash?: boolean } | undefined)?.trailingSlash) {
    vi.stubEnv("_next_intl_trailing_slash", "true");
  }
  return (await import("@/proxy")).default as unknown as Handler;
}

/**
 * The hrefs the proxy answers at all. Its matcher never sends `/api` or a path
 * with a dot (`/sitemap.xml`, `/llms.txt`) to it, and those are linked without
 * a locale or a slash in every configuration. The bare root is the locale
 * negotiation entry point under "always" (`/` → `/da`, before and after this
 * change): the 404 page links it as `/`, and changing that would change the
 * default render.
 */
function proxied(hrefs: string[], patch: Patch): string[] {
  const never = (patch.urls as { localePrefix?: string } | undefined)?.localePrefix === "never";
  return [...new Set(hrefs)].filter(
    (href) => !href.startsWith("/api/") && !href.includes(".") && (never || href !== "/"),
  );
}

async function expectServedDirectly(hrefs: string[], patch: Patch) {
  const proxy = await loadProxy(patch);
  const checked = proxied(hrefs, patch);
  expect(checked.length, "nothing left to check — the filter ate every href").toBeGreaterThan(0);
  for (const href of checked) {
    const res = await proxy(
      Object.assign(new NextRequest(new URL(href, ORIGIN)), { auth: null }) as NextRequest,
    );
    expect(
      { href, status: res.status, location: res.headers.get("location") },
      `${href} is not where the shop serves it`,
    ).toEqual({ href, status: 200, location: null });
  }
}

// ── 1. footers, trust badges, cookie banner, announcement bar, 404 page ────────

describe.each(Object.keys(OLD))("%s — hand-built links go through lib/urls.ts", (name) => {
  const present = has(fileOf(name));

  it.skipIf(!present)("renders the old strings, byte for byte, with brand.urls at its defaults", async () => {
    for (const patch of DEFAULT_VARIANTS) {
      expect(await renderedHrefs(name, patch), JSON.stringify(patch.urls)).toEqual(OLD[name](L));
    }
  });

  it.skipIf(!present).each(OPTIONS)("with %s every href is served where it points", async (_, patch) => {
    const hrefs = await renderedHrefs(name, patch);
    // Same links, same order — only their shape changed.
    expect(hrefs).toHaveLength(OLD[name](L).length);
    await expectServedDirectly(hrefs, patch);
  });
});

// ── 2. breadcrumbs, visible and JSON-LD ────────────────────────────────────────

/** The pages whose breadcrumb trail (and its BreadcrumbList steps) moved to `localeHref`. */
const BREADCRUMB_FILES = [
  "app/[locale]/product/[slug]/page.tsx",
  "app/[locale]/category/[slug]/page.tsx",
  "app/[locale]/produkter/page.tsx",
  "app/[locale]/services/[slug]/page.tsx",
  "plugins/blog/pages/BlogPostPage.tsx",
  "lib/service-jsonld.ts",
];

describe("breadcrumbs — the trail and its JSON-LD steps are built by lib/urls.ts", () => {
  it.each([...new Set([...BREADCRUMB_FILES, ...Object.keys(OLD).map(fileOf)])].filter(has))(
    "%s writes no locale path by hand",
    (file) => {
      const src = stripComments(readFileSync(path.join(REPO_ROOT, file), "utf8"));
      // `/${locale}…` in a template, or `withLocale(` without the slash rule.
      expect(src.match(/`\/\$\{locale\}[^`]*`/g) ?? [], file).toEqual([]);
      expect(src.match(/\bwithLocale\(/g) ?? [], file).toEqual([]);
    },
  );

  it("the sweep can fail", () => {
    const sweep = (src: string) => src.match(/`\/\$\{locale\}[^`]*`/g) ?? [];
    expect(sweep("{ label: home, href: `/${locale}` }")).toEqual(["`/${locale}`"]);
    expect(sweep("href: `/${locale}/produkter`,")).toEqual(["`/${locale}/produkter`"]);
    expect(sweep('href: localeHref("/produkter", locale),')).toEqual([]);
  });

  /** Each step a trail links: the locale home, the catalogue, services, the blog. */
  const STEPS = ["/", "/produkter", "/services", "/blog"];

  it("localeHref gives each step its old literal with brand.urls at its defaults", async () => {
    for (const patch of DEFAULT_VARIANTS) {
      vi.resetModules();
      await mockBrand(patch);
      const { localeHref } = await import("@/lib/urls");
      expect(STEPS.map((step) => localeHref(step, L))).toEqual([
        `/${L}`,
        `/${L}/produkter`,
        `/${L}/services`,
        `/${L}/blog`,
      ]);
    }
  });

  it.each(OPTIONS)("with %s each step is served where it points", async (_, patch) => {
    vi.resetModules();
    await mockBrand(patch);
    const { localeHref } = await import("@/lib/urls");
    await expectServedDirectly(
      STEPS.map((step) => localeHref(step, L)),
      patch,
    );
  });

  const serviceOpts = { title: "Hegn", description: "", brandUrl: ORIGIN, brandName: "Shop", locale: L };
  const jsonLdUrls = (ld: unknown) => JSON.stringify(ld).match(/https:\/\/shop\.example[^"]*/g) ?? [];

  it.skipIf(!has("lib/service-jsonld.ts"))(
    "the Service JSON-LD keeps its old addresses with brand.urls at its defaults",
    async () => {
      for (const patch of DEFAULT_VARIANTS) {
        vi.resetModules();
        await mockBrand(patch);
        const { buildServiceJsonLd } = await import("@/lib/service-jsonld");
        expect(jsonLdUrls(buildServiceJsonLd({ slug: "hegn", heroImage: null }, serviceOpts))).toEqual([
          `${ORIGIN}/${L}/services/hegn`,
          ORIGIN,
          `${ORIGIN}/${L}`,
          `${ORIGIN}/${L}/services`,
          `${ORIGIN}/${L}/services/hegn`,
        ]);
      }
    },
  );

  it.skipIf(!has("lib/service-jsonld.ts")).each(OPTIONS)(
    "with %s every Service JSON-LD address is served where it points",
    async (_, patch) => {
      vi.resetModules();
      await mockBrand(patch);
      const { buildServiceJsonLd } = await import("@/lib/service-jsonld");
      const paths = jsonLdUrls(buildServiceJsonLd({ slug: "hegn", heroImage: null }, serviceOpts))
        .filter((url) => url !== ORIGIN) // the provider's own `url` is the bare site
        .map((url) => new URL(url).pathname);
      expect(paths).toHaveLength(4);
      await expectServedDirectly(paths, patch);
    },
  );
});

// ── 3. the 404 for an address nothing serves ───────────────────────────────────

/**
 * `app/[locale]/not-found.tsx` is the 404 a page asks for (an unknown product);
 * an address no route matches lands on this catch-all, whose markdown and HTML
 * 404 both list the links `buildRecoveryLinks` returns.
 */
const MISSING = "app/[locale]/[...missing]/route.ts";

describe(`${MISSING} — the recovery links go through lib/urls.ts`, () => {
  async function recoveryLinks(patch: Patch): Promise<string> {
    vi.resetModules();
    await mockBrand(patch);
    const { buildRecoveryLinks } = (await import(/* @vite-ignore */ path.join(REPO_ROOT, MISSING))) as {
      buildRecoveryLinks: (locale: string, ecommerceEnabled: boolean, agentApi: boolean) => string;
    };
    return buildRecoveryLinks(L, true, true);
  }

  it.skipIf(!has(MISSING))("are the old strings, byte for byte, with brand.urls at its defaults", async () => {
    for (const patch of DEFAULT_VARIANTS) {
      expect(await recoveryLinks(patch), JSON.stringify(patch.urls)).toBe(
        [
          `- [Homepage](/${L})`,
          "- [Sitemap](/sitemap.xml)",
          "- [Agent instructions](/llms.txt)",
          `- [Developer documentation](/${L}/developers)`,
          `- [Product catalogue](/${L}/produkter)`,
        ].join("\n"),
      );
    }
  });

  it.skipIf(!has(MISSING)).each(OPTIONS)("with %s every one is served where it points", async (_, patch) => {
    const hrefs = [...(await recoveryLinks(patch)).matchAll(/\]\((\/[^)]*)\)/g)].map((m) => m[1]);
    expect(hrefs).toHaveLength(5);
    await expectServedDirectly(hrefs, patch);
  });
});
