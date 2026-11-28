import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { brand } from "@/brand.config";
import { profileCapabilities } from "@/lib/profile-capabilities";

/**
 * AUD18-a (b) and (c): the site must never hand a browser or a crawler an
 * address of its own that does not answer. Two such addresses are closed with
 * config-level redirects, and this test pins them on what Next will actually
 * load — `next.config.ts` is imported for real (Sentry and next-intl wrap the
 * object but leave `redirects()` as written), not a copy of the list.
 *
 * The locale rule is also DRIVEN through Next's own bundled path-to-regexp,
 * the matcher the server compiles `source` with, so "only the configured
 * locales, and never `/:locale/info/om-os`" is observed behaviour rather than
 * a reading of the pattern.
 */
type RedirectRule = { source: string; destination: string; permanent?: boolean };

const { pathToRegexp } = createRequire(import.meta.url)(
  "next/dist/compiled/path-to-regexp",
) as { pathToRegexp: (path: string) => RegExp };

async function loadRedirects(): Promise<RedirectRule[]> {
  const { default: config } = await import("@/next.config");
  expect(typeof config.redirects).toBe("function");
  return (await config.redirects!()) as RedirectRule[];
}

describe("next.config redirects — the site points only at addresses that answer", () => {
  it("sends /favicon.ico to the generated /icon, permanently", async () => {
    const rules = (await loadRedirects()).filter((r) => r.source === "/favicon.ico");
    expect(rules).toEqual([{ source: "/favicon.ico", destination: "/icon", permanent: true }]);
  });

  it("sends /:locale/om-os to /:locale/about for the configured locales only", async () => {
    const rules = (await loadRedirects()).filter((r) => r.destination === "/:locale/about");
    expect(rules).toEqual([
      {
        source: `/:locale(${brand.locales.join("|")})/om-os`,
        destination: "/:locale/about",
        permanent: true,
      },
    ]);

    const matcher = pathToRegexp(rules[0].source);
    for (const locale of brand.locales) {
      expect(matcher.test(`/${locale}/om-os`), `/${locale}/om-os`).toBe(true);
    }
    // Not a configured locale, the unaliased slug under /info, a different
    // slug, and the bare slug: none of these may be redirected.
    for (const miss of ["/xx/om-os", "/da/info/om-os", "/da/om-os-2", "/da/om", "/om-os"]) {
      expect(matcher.test(miss), miss).toBe(false);
    }
  });
});

/**
 * URL5-b R6: the list moved to lib/config-redirects.ts, so lib/urls.ts can read
 * the sources Next answers before the proxy runs. `redirects()` must still hand
 * Next the array it handed before, byte for byte — pinned against a frozen copy
 * of the expression next.config.ts held until then, for the shipped config and
 * for every input that expression read.
 */
function redirectsBeforeR6(
  locales: readonly string[],
  localePrefixNever: boolean,
  trailingSlash: boolean,
  trustPages: boolean,
): RedirectRule[] {
  return [
    { source: "/favicon.ico", destination: "/icon", permanent: true },
    ...(localePrefixNever
      ? Boolean(trustPages)
        ? [
            {
              source: `/:locale(${locales.join("|")})?/om-os`,
              destination: trailingSlash ? "/about/" : "/about",
              permanent: true,
            },
          ]
        : []
      : [
          {
            source: `/:locale(${locales.join("|")})/om-os`,
            destination: trailingSlash ? "/:locale/about/" : "/:locale/about",
            permanent: true,
          },
        ]),
  ];
}

describe("next.config redirects — byte-identical since the list moved (URL5-b R6)", () => {
  afterEach(() => {
    vi.doUnmock("@/brand.config");
    vi.doUnmock("@/lib/profile-capabilities");
    vi.resetModules();
  });

  it("the shipped config hands Next exactly the array it did before", async () => {
    const urls = (brand as { urls?: { localePrefix?: unknown; trailingSlash?: unknown } | null }).urls;
    const before = redirectsBeforeR6(
      brand.locales,
      urls?.localePrefix === "never",
      urls?.trailingSlash === true,
      profileCapabilities.trustPages,
    );
    expect(JSON.stringify(await loadRedirects())).toBe(JSON.stringify(before));
  });

  it("…and so does every combination of the inputs it reads", async () => {
    const actualBrand = await vi.importActual<typeof import("@/brand.config")>("@/brand.config");
    const actualCaps = await vi.importActual<typeof import("@/lib/profile-capabilities")>(
      "@/lib/profile-capabilities",
    );
    let compared = 0;
    for (const locales of [["da", "en"], ["da"], ["de"]]) {
      for (const localePrefixNever of locales.length === 1 ? [false, true] : [false]) {
        for (const trailingSlash of [false, true]) {
          for (const trustPages of [false, true]) {
            vi.resetModules();
            vi.doMock("@/brand.config", () => ({
              ...actualBrand,
              brand: {
                ...actualBrand.brand,
                locales,
                defaultLocale: locales[0],
                urls: { localePrefix: localePrefixNever ? "never" : "always", trailingSlash },
              },
            }));
            vi.doMock("@/lib/profile-capabilities", () => ({
              profileCapabilities: { ...actualCaps.profileCapabilities, trustPages },
            }));
            const after = JSON.stringify(await loadRedirects());
            const before = JSON.stringify(redirectsBeforeR6(locales, localePrefixNever, trailingSlash, trustPages));
            expect(after, JSON.stringify({ locales, localePrefixNever, trailingSlash, trustPages })).toBe(before);
            compared += 1;
          }
        }
      }
    }
    expect(compared).toBe(4 + 8 + 8);
  });

  it("lib/config-redirects.ts imports nothing — Next loads it with next.config.ts, where `@/` does not resolve", () => {
    // Vitest resolves the alias, so only `next build` would fail on one; this
    // fails here first.
    const src = readFileSync(path.join(process.cwd(), "lib/config-redirects.ts"), "utf8");
    expect(src).not.toMatch(/^\s*import[\s{"']|^\s*export\b[^;]*\bfrom\s|\brequire\(|\bimport\(/m);
    // …and next.config.ts reaches it by a relative path.
    expect(readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8")).toContain(
      'import { configRedirects } from "./lib/config-redirects";',
    );
  });
});
