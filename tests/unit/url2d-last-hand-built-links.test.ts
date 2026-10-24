import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { REPO_ROOT, stripComments } from "../helpers/claims";

/**
 * URL2-d — the last links the engine wrote by hand outside the design packs'
 * own chrome: the four shared chrome parts, the four bespoke 404 templates, the
 * Halo PDP's catalogue link, the blog index (cards + JSON-LD), the wishlist and
 * review pages, and the two mails (review prompt, abandoned cart).
 *
 * Pinned here:
 *  1. None of these files builds a locale path by hand any more
 *     (`/${locale}…`, `${home}/…`, a hardcoded `/da/`, a locale-less `/cart`).
 *  2. With `brand.urls` at its defaults, every path they now ask lib/urls.ts
 *     for is the old literal, byte for byte — the 404 templates are rendered
 *     and compared — so every canary renders the same strings.
 *  3. The review-prompt mail follows the shop's base locale (on an en-only shop
 *     the old hardcoded `/da/review/…` pointed at a route that does not exist),
 *     and keeps that locale segment under `localePrefix: "never"` too: its token
 *     has a dot, so the proxy never sees the path — run through the cron route.
 *
 * Every brand value a row depends on is set by the row, so the file holds in a
 * scaffold whose own brand.config differs. A file the profile removed is skipped.
 */

const FILES = [
  "components/chrome-parts/MinimalHeader.tsx",
  "components/chrome-parts/CenteredHeader.tsx",
  "components/chrome-parts/SlimFooter.tsx",
  "components/chrome-parts/MegaFooter.tsx",
  "designs/flux/not-found.tsx",
  "designs/halo/not-found.tsx",
  "designs/aerospace/not-found.tsx",
  "designs/drive/not-found.tsx",
  "designs/halo/PdpLayout.tsx",
  "plugins/blog/pages/BlogIndexPage.tsx",
  "plugins/wishlist/components/WishlistButton.tsx",
  "plugins/wishlist/pages/WishlistPage.tsx",
  "plugins/reviews/pages/ReviewTokenPage.tsx",
  "plugins/reviews/pages/OrderReviewPage.tsx",
  "plugins/reviews/api/review-prompt-cron.ts",
  "lib/abandoned-cart.ts",
];

const has = (file: string) => existsSync(path.join(REPO_ROOT, file));

/** Every hand-built locale path the sweep refuses, in one list. */
function handBuilt(src: string): string[] {
  return [
    // `/${locale}` or `/${locale}/x` in a template literal.
    ...(src.match(/`\/\$\{locale\}[^`]*`/g) ?? []),
    // `${home}/x`, where `home` was the hand-built locale root.
    ...(src.match(/`\$\{home\}\/[^`]*`/g) ?? []),
    // A base locale written into a path.
    ...(src.match(/\/da\/(?:review|cart|account)\b/g) ?? []),
    // The storefront cart without any locale.
    ...(src.match(/\$\{brand\.url\}\/cart/g) ?? []),
  ];
}

type Patch = Record<string, unknown>;

async function mockBrand(patch: Patch) {
  const actual = await vi.importActual<typeof import("@/brand.config")>("@/brand.config");
  const brand = { ...actual.brand, ...patch };
  vi.doMock("@/brand.config", () => ({ ...actual, brand }));
  return brand;
}

afterEach(() => {
  vi.doUnmock("@/brand.config");
  vi.resetModules();
});

const DEFAULT_VARIANTS: Patch[] = [
  { locales: ["da", "en"], defaultLocale: "da", urls: undefined },
  { locales: ["da", "en"], defaultLocale: "da", urls: {} },
  {
    locales: ["da", "en"],
    defaultLocale: "da",
    urls: { permalinks: false, trailingSlash: false, localePrefix: "always" },
  },
];

describe("URL2-d — the last hand-built links go through lib/urls.ts", () => {
  it.each(FILES.filter(has))("%s writes no locale path by hand", (file) => {
    const src = stripComments(readFileSync(path.join(REPO_ROOT, file), "utf8"));
    expect(handBuilt(src), file).toEqual([]);
  });

  it("the sweep can fail", () => {
    expect(handBuilt("href={`/${locale}/account`}")).toEqual(["`/${locale}/account`"]);
    expect(handBuilt("href={`${home}/contact`}")).toEqual(["`${home}/contact`"]);
    expect(handBuilt("const u = `${brand.url}/da/review/${t}`;")).toEqual(["/da/review"]);
    expect(handBuilt("cartUrl: `${brand.url}/cart`,")).toEqual(["${brand.url}/cart"]);
    expect(handBuilt('href={localeHref("/contact", locale)}')).toEqual([]);
  });

  /** Every path the rewritten files hand to `localeHref`, and the literal it replaced. */
  const PATHS: [string, string][] = [
    ["/", "/da"],
    ["/services", "/da/services"],
    ["/contact", "/da/contact"],
    ["/privacy", "/da/privacy"],
    ["/info/faq", "/da/info/faq"],
    ["/info/terms", "/da/info/terms"],
    ["/produkter", "/da/produkter"],
    ["/account", "/da/account"],
    ["/account/login", "/da/account/login"],
    ["/account/orders", "/da/account/orders"],
    ["/account/orders/ord_1/review", "/da/account/orders/ord_1/review"],
    ["/cart", "/da/cart"],
    ["/blog", "/da/blog"],
  ];

  it("with brand.urls at its defaults, each path is the old literal", async () => {
    for (const patch of DEFAULT_VARIANTS) {
      vi.resetModules();
      await mockBrand(patch);
      const { localeHref, postHref } = await import("@/lib/urls");
      for (const [given, old] of PATHS) {
        expect(localeHref(given, "da"), `${given} ${JSON.stringify(patch.urls)}`).toBe(old);
      }
      expect(postHref("hej-verden", "da")).toBe("/da/blog/hej-verden");
      expect(postHref(encodeURIComponent("hej-verden"), "da")).toBe("/da/blog/hej-verden");
    }
  });

  it("with trailingSlash the links carry the slash the shop serves them at", async () => {
    vi.resetModules();
    await mockBrand({ locales: ["da", "en"], defaultLocale: "da", urls: { trailingSlash: true } });
    const { localeHref } = await import("@/lib/urls");
    expect(localeHref("/contact", "da")).toBe("/da/contact/");
    expect(localeHref("/cart", "da")).toBe("/da/cart/");
  });

  it('with localePrefix "never" the links drop the locale', async () => {
    vi.resetModules();
    await mockBrand({ locales: ["da"], defaultLocale: "da", urls: { localePrefix: "never" } });
    const { localeHref } = await import("@/lib/urls");
    expect(localeHref("/", "da")).toBe("/");
    expect(localeHref("/account/login", "da")).toBe("/account/login");
  });

  // The abandoned-cart mail links its cart page through the helper, in the base
  // locale; its behaviour is pinned in abandoned-cart.test.ts.
  it.skipIf(!has("lib/abandoned-cart.ts"))("lib/abandoned-cart.ts links in brand.defaultLocale", () => {
    const src = stripComments(readFileSync(path.join(REPO_ROOT, "lib/abandoned-cart.ts"), "utf8"));
    const call = src.split("\n").find((line) => line.includes("localeHref(") && line.includes('"/cart"'));
    expect(call, "no localeHref call for /cart").toBeDefined();
    expect(call).toContain("brand.defaultLocale");
    expect(call).toContain('brand.url.replace(/\\/+$/, "")');
  });

  // The review mail keeps the locale segment ALWAYS. Its signed token has a dot,
  // and the proxy's matcher skips every dotted path, so a locale-less
  // `/review/<token>` (what localeHref gives under localePrefix "never") would
  // never be rewritten to `app/[locale]/review/[token]` — a 404.
  it("the proxy never sees a dotted path, so a review link must carry its locale", () => {
    const src = readFileSync(path.join(REPO_ROOT, "proxy.ts"), "utf8");
    const raw = src.match(/matcher:\s*\[\s*'([^']+)'/)?.[1];
    expect(raw, "proxy.ts matcher not found").toBeDefined();
    const matcher = new RegExp(`^${raw!.replace(/\\\\/g, "\\")}$`);
    expect(matcher.test("/review/abc"), "sanity: an undotted path reaches the proxy").toBe(true);
    expect(matcher.test("/review/payload.signature")).toBe(false);
    expect(existsSync(path.join(REPO_ROOT, "app/[locale]/review/[token]"))).toBe(true);
  });

  it.skipIf(!has("plugins/reviews/api/review-prompt-cron.ts")).each([
    ["an en-only shop", { locales: ["en"], defaultLocale: "en", urls: undefined }, "/en/review/"],
    ['localePrefix "never"', { locales: ["en"], defaultLocale: "en", urls: { localePrefix: "never" } }, "/en/review/"],
    ["a Danish shop", { locales: ["da", "en"], defaultLocale: "da", urls: undefined }, "/da/review/"],
  ] as [string, Patch, string][])("the review mail sent by the cron route on %s keeps the locale segment", async (_, patch, head) => {
    vi.resetModules();
    const actual = await vi.importActual<typeof import("@/brand.config")>("@/brand.config");
    const brand = {
      ...actual.brand,
      ...patch,
      url: "https://shop.example/",
      features: { ...actual.brand.features, reviews: true },
    };
    vi.doMock("@/brand.config", () => ({ ...actual, brand }));
    vi.doMock("@/lib/cron/auth", () => ({ verifyCronRequest: () => null }));
    const paidAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    vi.doMock("@/lib/db", () => ({
      prisma: {
        order: {
          findMany: async () => [
            {
              id: "ord_1",
              email: "kunde@example.com",
              paidAt,
              shippingName: "Kunde",
              items: [{ productName: "Hegn", product: { name: "Hegn", slug: "hegn" } }],
            },
          ],
        },
        reviewPromptLog: { create: async () => ({}) },
      },
    }));
    vi.doMock("@/plugins/reviews/lib/review-token", () => ({ signReviewToken: () => "cGF5bG9hZA.c2ln" }));
    vi.doMock("@/plugins/reviews/lib/reviewable-items", () => ({
      reviewableItems: (items: unknown[]) => items,
    }));
    const sent: { tokenUrl: string }[] = [];
    vi.doMock("@/plugins/reviews/lib/mailer-review-prompt", () => ({
      sendReviewPromptEmail: async (arg: { tokenUrl: string }) => {
        sent.push(arg);
        return { messageId: "m1" };
      },
    }));
    vi.stubEnv("REVIEW_PROMPTS_FROM", "2000-01-01T00:00:00.000Z");
    try {
      const { GET } = (await import(
        /* @vite-ignore */ path.join(REPO_ROOT, "plugins/reviews/api/review-prompt-cron.ts")
      )) as { GET: (req: Request) => Promise<Response> };
      const res = await GET(new Request("https://shop.example/api/cron/review-prompt"));
      expect(res.status).toBe(200);
      expect(sent.map((m) => m.tokenUrl)).toEqual([`https://shop.example${head}cGF5bG9hZA.c2ln`]);
    } finally {
      vi.unstubAllEnvs();
      for (const mod of [
        "@/lib/cron/auth",
        "@/lib/db",
        "@/plugins/reviews/lib/review-token",
        "@/plugins/reviews/lib/reviewable-items",
        "@/plugins/reviews/lib/mailer-review-prompt",
      ]) {
        vi.doUnmock(mod);
      }
    }
  });

  // The 404 templates are plain components: render them and compare hrefs.
  const NOT_FOUND: Record<string, (l: string) => string[]> = {
    "designs/flux/not-found.tsx": (l) => [`/${l}`, `/${l}/contact`],
    "designs/halo/not-found.tsx": (l) => [`/${l}`, `/${l}/contact`],
    "designs/aerospace/not-found.tsx": (l) => [`/${l}`, `/${l}/contact`],
    "designs/drive/not-found.tsx": (l) => [`/${l}`, `/${l}/contact`],
  };

  it.each(Object.keys(NOT_FOUND).filter(has))("%s renders its old hrefs by default", async (file) => {
    for (const patch of DEFAULT_VARIANTS) {
      vi.resetModules();
      await mockBrand(patch);
      const { createElement } = await import("react");
      const { renderToStaticMarkup } = await import("react-dom/server");
      const { default: Page } = (await import(/* @vite-ignore */ path.join(REPO_ROOT, file))) as {
        default: (props: { locale: string }) => unknown;
      };
      const html = renderToStaticMarkup(createElement(Page as never, { locale: "da" }));
      const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
      expect(hrefs, JSON.stringify(patch.urls)).toEqual(NOT_FOUND[file]("da"));
    }
  });
});
