import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `lib/urls.ts` reads `brand.locales` and `brand.urls` at CALL time, so one
 * mutable double stands in for brand.config and every row of the tables below
 * sets the three options before building its link — no module reset needed.
 * The real config is kept aside (`shipped`) for the one test that pins what
 * the engine ships.
 */
const state = vi.hoisted(() => ({
  locales: ["da", "en"] as readonly string[],
  urls: undefined as Record<string, unknown> | undefined,
  shipped: null as null | import("@/lib/urls").UrlConfigSource,
  /** R6: the about page exists (next.config.ts's om-os redirect needs it under "never"). */
  trustPages: true,
}));

vi.mock("@/brand.config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/brand.config")>();
  state.shipped = actual.brand;
  return {
    brand: {
      get locales() {
        return state.locales;
      },
      get urls() {
        return state.urls;
      },
    },
  };
});

vi.mock("@/lib/profile-capabilities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/profile-capabilities")>();
  return {
    profileCapabilities: {
      ...actual.profileCapabilities,
      get trustPages() {
        return state.trustPages;
      },
    },
  };
});

import {
  URL_DEFAULTS,
  applyTrailingSlash,
  assertUrlConfig,
  categoryHref,
  pageHref,
  permalinkInEffect,
  postHref,
  productHref,
  resolveUrlConfig,
  withLocale,
} from "@/lib/urls";

type Prefix = "always" | "never";

function configure(prefix: Prefix, trailingSlash: boolean, permalinks: boolean) {
  state.locales = prefix === "never" ? ["da"] : ["da", "en"];
  state.urls = { localePrefix: prefix, trailingSlash, permalinks };
}

beforeEach(() => {
  state.locales = ["da", "en"];
  state.urls = undefined;
  state.trustPages = true;
});

describe("the shipped config", () => {
  it("resolves to the three defaults — today's URLs, byte for byte", () => {
    expect(assertUrlConfig(state.shipped!)).toEqual(URL_DEFAULTS);
    expect(URL_DEFAULTS).toEqual({
      permalinks: false,
      trailingSlash: false,
      localePrefix: "always",
    });
  });

  it.each([
    [undefined, "block absent"],
    [{}, "empty block"],
    [{ permalinks: undefined, trailingSlash: undefined, localePrefix: undefined }, "explicit undefineds"],
  ] as Array<[Record<string, unknown> | undefined, string]>)(
    "falls back to the defaults for %j (%s)",
    (urls) => {
      state.urls = urls;
      expect(resolveUrlConfig()).toEqual(URL_DEFAULTS);
    },
  );

  it("reproduces every call-site pattern with the block absent", () => {
    for (const locale of ["da", "en"]) {
      expect(productHref({ slug: "x" }, locale)).toBe(`/${locale}/product/x`);
      expect(categoryHref({ slug: "hegn" }, locale)).toBe(`/${locale}/category/hegn`);
      expect(pageHref("faq", locale)).toBe(`/${locale}/info/faq`);
      expect(pageHref("om-os", locale)).toBe(`/${locale}/about`);
      expect(postHref("hello", locale)).toBe(`/${locale}/blog/hello`);
    }
    // A stored permalink is INERT until the flag is on.
    expect(productHref({ slug: "x", permalink: "/hegn/x/" }, "da")).toBe("/da/product/x");
    expect(categoryHref({ slug: "hegn", permalink: "/hegn/" }, "da")).toBe("/da/category/hegn");
  });
});

describe("the guard", () => {
  it('rejects localePrefix "never" on a shop with two locales, naming the fix', () => {
    state.locales = ["da", "en"];
    state.urls = { localePrefix: "never" };
    expect(() => resolveUrlConfig()).toThrow(/localePrefix: "never" needs exactly one locale/);
    expect(() => resolveUrlConfig()).toThrow(/brand\.locales has 2 \(da, en\)/);
  });

  it('accepts localePrefix "never" on a single-locale shop', () => {
    state.locales = ["da"];
    state.urls = { localePrefix: "never" };
    expect(resolveUrlConfig()).toEqual({ ...URL_DEFAULTS, localePrefix: "never" });
  });

  it("never infers the prefix from the locale count: one locale still means /da/", () => {
    state.locales = ["da"];
    state.urls = undefined;
    expect(productHref({ slug: "x" }, "da")).toBe("/da/product/x");
  });

  it.each([
    [{ localePrefix: "as-needed" }, /localePrefix must be "always" or "never"/],
    [{ permalinks: "yes" }, /permalinks must be true or false/],
    [{ trailingSlash: 1 }, /trailingSlash must be true or false/],
  ])("rejects a value it does not know: %j", (urls, message) => {
    state.urls = urls;
    expect(() => resolveUrlConfig()).toThrow(message);
  });

  it("fails at the call, not at import", async () => {
    state.locales = ["da", "en"];
    state.urls = { localePrefix: "never" };
    // The module is already loaded above with a valid config; re-importing it
    // with an invalid one must still not throw — only building a link does.
    await expect(import("@/lib/urls")).resolves.toBeTruthy();
    expect(() => productHref({ slug: "x" }, "da")).toThrow();
  });
});

describe("withLocale", () => {
  it.each([
    ["always", "/product/x", "/da/product/x"],
    ["always", "product/x", "/da/product/x"],
    ["always", "//product//x", "/da/product/x"],
    ["always", "/", "/da"],
    ["always", "", "/da"],
    ["always", "/search?q=a/b", "/da/search?q=a/b"],
    ["never", "/product/x", "/product/x"],
    ["never", "product/x", "/product/x"],
    ["never", "//product//x", "/product/x"],
    ["never", "/", "/"],
    ["never", "", "/"],
    ["never", "/search?q=a/b", "/search?q=a/b"],
  ] as const)("%s: %j → %s", (prefix, path, expected) => {
    configure(prefix, false, false);
    expect(withLocale(path, "da")).toBe(expected);
  });
});

describe("applyTrailingSlash", () => {
  it.each([
    [false, "/", "/"],
    [false, "/x", "/x"],
    [false, "/x/", "/x"],
    [false, "/x//", "/x"],
    [false, "/x/?page=2", "/x?page=2"],
    [false, "/katalog.pdf/", "/katalog.pdf"],
    [true, "/", "/"],
    [true, "/x", "/x/"],
    [true, "/x/", "/x/"],
    [true, "/x//", "/x/"],
    [true, "/x?page=2", "/x/?page=2"],
    [true, "/x#top", "/x/#top"],
    [true, "/katalog.pdf", "/katalog.pdf"],
    [true, "/a.b/c", "/a.b/c/"],
    // Any dot in the last segment leaves it bare (`isDottedSegment`): the
    // proxies never see a dotted path, so it is never slash-redirected (URL2).
    [true, "/v1.2-beta", "/v1.2-beta"],
    [true, "/side.html", "/side.html"],
  ])("trailingSlash=%s: %j → %s", (trailingSlash, path, expected) => {
    configure("always", trailingSlash, false);
    expect(applyTrailingSlash(path)).toBe(expected);
  });
});

/**
 * The full matrix for the two helpers that may carry a permalink:
 * prefix × trailing slash × permalinks flag × permalink set/unset.
 * `permalink` wins ONLY on the rows where the flag is on AND a permalink exists.
 */
const PRODUCT = { slug: "x", permalink: "/hegn/komposithegn/x/" };
const CATEGORY = { slug: "hegn", permalink: "/hegn/" };

const ENTITY_ROWS: Array<[Prefix, boolean, boolean, boolean, string, string]> = [
  // prefix, trailingSlash, permalinks flag, permalink set, product, category
  ["always", false, false, false, "/da/product/x", "/da/category/hegn"],
  ["always", false, false, true, "/da/product/x", "/da/category/hegn"],
  ["always", false, true, false, "/da/product/x", "/da/category/hegn"],
  ["always", false, true, true, "/da/hegn/komposithegn/x", "/da/hegn"],
  ["always", true, false, false, "/da/product/x/", "/da/category/hegn/"],
  ["always", true, false, true, "/da/product/x/", "/da/category/hegn/"],
  ["always", true, true, false, "/da/product/x/", "/da/category/hegn/"],
  ["always", true, true, true, "/da/hegn/komposithegn/x/", "/da/hegn/"],
  ["never", false, false, false, "/product/x", "/category/hegn"],
  ["never", false, false, true, "/product/x", "/category/hegn"],
  ["never", false, true, false, "/product/x", "/category/hegn"],
  ["never", false, true, true, "/hegn/komposithegn/x", "/hegn"],
  ["never", true, false, false, "/product/x/", "/category/hegn/"],
  ["never", true, false, true, "/product/x/", "/category/hegn/"],
  ["never", true, true, false, "/product/x/", "/category/hegn/"],
  ["never", true, true, true, "/hegn/komposithegn/x/", "/hegn/"],
];

describe("productHref × categoryHref", () => {
  it.each(ENTITY_ROWS)(
    "prefix=%s slash=%s flag=%s permalink=%s → %s, %s",
    (prefix, slash, flag, set, product, category) => {
      configure(prefix, slash, flag);
      const p = set ? PRODUCT : { slug: PRODUCT.slug };
      const c = set ? CATEGORY : { slug: CATEGORY.slug };
      expect(productHref(p, "da")).toBe(product);
      expect(categoryHref(c, "da")).toBe(category);
    },
  );

  it.each([
    [null, "/da/product/x"],
    ["", "/da/product/x"],
    ["   ", "/da/product/x"],
    ["hegn/x", "/da/hegn/x"],
    ["/hegn//x/", "/da/hegn/x"],
    ["https://hegnsfabrikken.dk/hegn/x/", "/da/hegn/x"],
    ["https://hegnsfabrikken.dk/hegn/x/?attribute_pa_farve=sort", "/da/hegn/x?attribute_pa_farve=sort"],
  ])("with the flag on, a permalink of %j links to %s", (permalink, expected) => {
    configure("always", false, true);
    expect(productHref({ slug: "x", permalink }, "da")).toBe(expected);
  });
});

/** Page and post links follow prefix × trailing slash; the permalinks flag has no say. */
const SLUG_ROWS: Array<[Prefix, boolean, boolean, string, string, string, string]> = [
  // prefix, trailingSlash, permalinks flag, info page, trust alias, contact, post
  ["always", false, false, "/da/info/faq", "/da/about", "/da/contact", "/da/blog/hello"],
  ["always", false, true, "/da/info/faq", "/da/about", "/da/contact", "/da/blog/hello"],
  ["always", true, false, "/da/info/faq/", "/da/about/", "/da/contact/", "/da/blog/hello/"],
  ["always", true, true, "/da/info/faq/", "/da/about/", "/da/contact/", "/da/blog/hello/"],
  ["never", false, false, "/info/faq", "/about", "/contact", "/blog/hello"],
  ["never", false, true, "/info/faq", "/about", "/contact", "/blog/hello"],
  ["never", true, false, "/info/faq/", "/about/", "/contact/", "/blog/hello/"],
  ["never", true, true, "/info/faq/", "/about/", "/contact/", "/blog/hello/"],
];

describe("pageHref × postHref", () => {
  it.each(SLUG_ROWS)(
    "prefix=%s slash=%s flag=%s → %s, %s, %s, %s",
    (prefix, slash, flag, info, about, contact, post) => {
      configure(prefix, slash, flag);
      expect(pageHref("faq", "da")).toBe(info);
      expect(pageHref("om-os", "da")).toBe(about);
      expect(pageHref("contact", "da")).toBe(contact);
      expect(postHref("hello", "da")).toBe(post);
    },
  );

  it("keeps the trust-route table of lib/canonical-public-routes (no second alias map)", () => {
    configure("always", false, false);
    expect(pageHref("about", "en")).toBe("/en/about");
    expect(pageHref("privacy", "en")).toBe("/en/privacy");
    expect(pageHref("constructor", "en")).toBe("/en/info/constructor");
  });
});

/**
 * A permalink is imported data. Browsers read `\` as `/` and drop tab/CR/LF, so
 * without normalisation `/\evil.com/x` is a protocol-relative link off the site
 * — invisible under "always" (the `/da` prefix neutralises it), live under "never".
 */
describe("a permalink never leaves the shop's host", () => {
  it.each([
    "/\\evil.com/x",
    "\\\\evil.com/x",
    "/\n/evil.com/x",
    "/\t/evil.com/x",
    "\\/evil.com/x",
  ])("never + permalinks: %j stays on shop.dk", (permalink) => {
    configure("never", false, true);
    const href = productHref({ slug: "x", permalink }, "da");
    expect(new URL(href, "https://shop.dk/").host).toBe("shop.dk");
    expect(href.startsWith("//")).toBe(false);
  });

  it("a backslash in the query is data, not a separator — left as it was", () => {
    configure("never", false, true);
    expect(productHref({ slug: "x", permalink: "/hegn/x?q=a\\b" }, "da")).toBe("/hegn/x?q=a\\b");
  });
});

describe("withLocale refuses a locale that is not one path segment", () => {
  it.each(["", "/", "da/en", "\\", "..", ".", "da?x", "da#x", "d a"])("%j throws", (locale) => {
    configure("always", false, false);
    expect(() => withLocale("/product/x", locale)).toThrow(/single path segment/);
    expect(() => productHref({ slug: "x" }, locale)).toThrow(/single path segment/);
  });

  it("the `{locale}` template placeholder is one segment and passes", () => {
    configure("always", false, false);
    expect(productHref({ slug: "x" }, "{locale}")).toBe("/{locale}/product/x");
    expect(categoryHref({ slug: "y" }, "{locale}")).toBe("/{locale}/category/y");
  });
});

describe("a permalink with a dot segment is ignored for the pattern", () => {
  it.each(["/hegn/../admin", "/./hegn/x", "/hegn/%2e%2e/admin", "/hegn/%2E/x", "/hegn/.%2e/x"])(
    "%j → the pattern",
    (permalink) => {
      configure("always", false, true);
      expect(productHref({ slug: "x", permalink }, "da")).toBe("/da/product/x");
      expect(categoryHref({ slug: "y", permalink }, "da")).toBe("/da/category/y");
    },
  );

  it("a dot inside a segment, or an encoded slash, keeps the pattern — the shop cannot serve it yet (URL5-b)", () => {
    configure("always", false, true);
    for (const permalink of ["/hegn/x.html", "/hegn/...x", "/1.8m-hegn/x/", "/hegn/a%2Fb/", "/1%2E8m-hegn/x/"]) {
      expect(productHref({ slug: "x", permalink }, "da")).toBe("/da/product/x");
    }
    expect(productHref({ slug: "x", permalink: "/hegn/x/" }, "da")).toBe("/da/hegn/x");
  });

  it("a permalink under one of the matcher's skipped prefixes keeps the pattern under never (R2: `hero` is the /hero segment)", () => {
    configure("never", false, true);
    for (const permalink of ["/hero/x/", "/hero/", "/apple-icon-hegn/", "/opengraph-image-x/"]) {
      expect(productHref({ slug: "x", permalink }, "da")).toBe("/product/x");
    }
    expect(productHref({ slug: "x", permalink: "/hegn/hero/" }, "da")).toBe("/hegn/hero");
    // PROXY-SEGMENT-BOUNDARIES: a name that only begins with `hero` reaches the proxy.
    for (const permalink of ["/heron-hegn/x/", "/heroes/", "/hero-sale/"]) {
      expect(productHref({ slug: "x", permalink }, "da")).toBe(permalink.replace(/\/$/, ""));
    }
  });

  it("R4: …but is linked under always, where its address (`/da/hero/x/`) passes the matcher", () => {
    configure("always", false, true);
    for (const permalink of ["/heron-hegn/x/", "/hero/x/", "/apple-icon-hegn/", "/opengraph-image-x/"]) {
      expect(productHref({ slug: "x", permalink }, "da")).toBe(`/da${permalink.replace(/\/$/, "")}`);
    }
  });

  it.each(["always", "never"] as const)(
    "R4: a permalink under a reserved segment keeps the pattern (%s) — the proxy never serves it",
    (prefix) => {
      configure(prefix, false, true);
      const head = prefix === "never" ? "" : "/da";
      for (const permalink of ["/og/x/", "/oauth/authorize/", "/icon", "/api/x/", "/admin/x", "/account/orders/"]) {
        expect(productHref({ slug: "x", permalink }, "da")).toBe(`${head}/product/x`);
        expect(categoryHref({ slug: "y", permalink }, "da")).toBe(`${head}/category/y`);
      }
      // Whole segments only: these are ordinary permalinks.
      for (const permalink of ["/ogham/", "/icons/", "/apikultur/", "/accounting/", "/hegn/og/"]) {
        expect(productHref({ slug: "x", permalink }, "da")).toBe(`${head}${permalink.replace(/\/$/, "")}`);
      }
    },
  );

  it.each(["always", "never"] as const)(
    "R5: a permalink with no lookup key keeps the pattern (%s) — the proxy can never serve it",
    (prefix) => {
      configure(prefix, false, true);
      const head = prefix === "never" ? "" : "/da";
      // No path of its own (WooCommerce "Plain" permalinks among them), or broken
      // percent-encoding: before, these linked the homepage or a dead address.
      for (const permalink of [
        "/",
        "https://old.example/",
        "/?p=123",
        "https://old.example/?product=type-1",
        "?p=1",
        "#top",
        "/hegn/%E0%A4%A/",
        "/100%-hegn/",
      ]) {
        expect(productHref({ slug: "x", permalink }, "da"), permalink).toBe(`${head}/product/x`);
        expect(categoryHref({ slug: "y", permalink }, "da"), permalink).toBe(`${head}/category/y`);
        expect(permalinkInEffect({ slug: "x", permalink }), permalink).toBe(false);
      }
      // A full URL with a path, and a query on a real path, still link the path.
      expect(productHref({ slug: "x", permalink: "https://old.example/hegn/x/?p=1" }, "da")).toBe(`${head}/hegn/x?p=1`);
      expect(productHref({ slug: "x", permalink: "/hegn/%C3%A6r%C3%B8/" }, "da")).toBe(`${head}/hegn/%C3%A6r%C3%B8`);
    },
  );

  it("R5: the matcher's `favicon.ico` is a regex — its dot is any character, so `/favicon-ico…` keeps the pattern under never", () => {
    configure("never", false, true);
    for (const permalink of ["/favicon-ico-hegn/", "/faviconXico/"]) {
      expect(productHref({ slug: "x", permalink }, "da"), permalink).toBe("/product/x");
    }
    // Under always the address starts with the locale and passes the matcher.
    configure("always", false, true);
    expect(productHref({ slug: "x", permalink: "/favicon-ico-hegn/" }, "da")).toBe("/da/favicon-ico-hegn");
  });

  it.each(["always", "never"] as const)(
    "R6: a permalink at an address next.config.ts redirects keeps the pattern (%s) — Next answers it before the proxy",
    (prefix) => {
      for (const trailingSlash of [false, true]) {
        configure(prefix, trailingSlash, true);
        const head = prefix === "never" ? "" : "/da";
        const slash = trailingSlash ? "/" : "";
        // `/:locale/om-os` (under never `/om-os` too) is redirected to the about
        // page with or without its slash, in any case — and a router may decode
        // the path first (`%4F` is `O`).
        const redirected = ["/om-os/", "/om-os", "/OM-OS/", "/Om-Os", "/%4Fm-os/", "https://old.example/om-os/"];
        // Under never the locale is optional in the source, so `/da/om-os` is one too.
        if (prefix === "never") redirected.push("/da/om-os/");
        for (const permalink of redirected) {
          expect(productHref({ slug: "x", permalink }, "da"), permalink).toBe(`${head}/product/x${slash}`);
          expect(categoryHref({ slug: "y", permalink }, "da"), permalink).toBe(`${head}/category/y${slash}`);
          expect(permalinkInEffect({ slug: "x", permalink }), permalink).toBe(false);
        }
        // Near misses are no redirect source, and are linked.
        for (const permalink of ["/om-os-hegn/", "/info/om-os/", "/hegn/om-os/", "/om/"]) {
          expect(productHref({ slug: "x", permalink }, "da"), permalink).toBe(`${head}${permalink.slice(0, -1)}${slash}`);
        }
      }
      // Under always the stored `/da/om-os/` is asked for as `/da/da/om-os/`: no redirect.
      configure("always", false, true);
      expect(productHref({ slug: "x", permalink: "/da/om-os/" }, "da")).toBe("/da/da/om-os");
    },
  );

  it("R6: under never, a profile without the about page has no om-os redirect — the permalink is linked", () => {
    configure("never", false, true);
    state.trustPages = false;
    expect(productHref({ slug: "x", permalink: "/om-os/" }, "da")).toBe("/om-os");
    expect(productHref({ slug: "x", permalink: "/da/om-os/" }, "da")).toBe("/da/om-os");
    // Under always the redirect is there in every profile.
    configure("always", false, true);
    expect(productHref({ slug: "x", permalink: "/om-os/" }, "da")).toBe("/da/product/x");
  });

  it("with permalinks off the dot rule never runs — the pattern, as before", () => {
    configure("always", false, false);
    expect(productHref({ slug: "x", permalink: "/hegn/../admin" }, "da")).toBe("/da/product/x");
  });

  it("R4: with permalinks off the matcher and reserved rules never run either — the pattern, byte for byte", () => {
    for (const prefix of ["always", "never"] as const) {
      configure(prefix, false, false);
      const head = prefix === "never" ? "" : "/da";
      for (const permalink of ["/hegn/x/", "/heron-hegn/x/", "/og/x/", "/apikultur/"]) {
        expect(productHref({ slug: "x", permalink }, "da")).toBe(`${head}/product/x`);
        expect(productHref({ slug: "x", permalink }, "da")).toBe(productHref({ slug: "x" }, "da"));
      }
    }
  });
});
