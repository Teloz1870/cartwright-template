import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { brand } from "@/brand.config";

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
