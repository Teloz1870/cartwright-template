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

import {
  URL_DEFAULTS,
  applyTrailingSlash,
  assertUrlConfig,
  categoryHref,
  pageHref,
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

  it("a dot inside a segment is an ordinary name and is kept", () => {
    configure("always", false, true);
    expect(productHref({ slug: "x", permalink: "/hegn/x.html" }, "da")).toBe("/da/hegn/x.html");
    expect(productHref({ slug: "x", permalink: "/hegn/...x" }, "da")).toBe("/da/hegn/...x");
  });

  it("with permalinks off the dot rule never runs — the pattern, as before", () => {
    configure("always", false, false);
    expect(productHref({ slug: "x", permalink: "/hegn/../admin" }, "da")).toBe("/da/product/x");
  });
});
