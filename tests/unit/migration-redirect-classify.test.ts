import { afterEach, describe, expect, it, vi } from "vitest";
import { brand } from "@/brand.config";
import {
  classifyRedirect,
  judgeLegacyShadow,
  judgeRedirectActive,
  mergeRedirectSummary,
  probeRedirect,
  type RedirectProbe,
  type SavedRedirect,
} from "@/lib/migration/checks/redirect";
import { CHECK_CATALOG } from "@/lib/migration/catalog";
import type { MigrationFetcher, MigrationResponse } from "@/lib/migration/fetch";
import { bindingsFor, isFreshPass } from "@/lib/migration/ready";

/**
 * MIGD `redirect.imported`, `redirect.active` and `redirect.legacy-shadow`, pure:
 * every verdict from a table of fake answers on the host shop.example.test, so
 * nothing here touches a network or a database. Ships in scaffolds, so a locale
 * prefix is the tree's own default locale, never a literal.
 */

const SHOP = "https://shop.example.test";
const L: string = brand.defaultLocale;

const page = (url: string, status = 200): MigrationResponse =>
  ({ outcome: "answer", url, status, location: null, contentType: "text/html", body: status === 200 ? "<html>ok</html>" : "", truncated: false });
const moved = (url: string, status: number, location: string | null): MigrationResponse =>
  ({ outcome: "answer", url, status, location, contentType: "text/html", body: "", truncated: false });
const down = (url: string, status = 503): MigrationResponse => ({ outcome: "inconclusive", url, status, reason: `HTTP ${status}` });

/** A site as `path → answer`; a path it does not know is a 404. */
function site(answers: Record<string, (url: string) => MigrationResponse>) {
  return vi.fn<MigrationFetcher>(async (url) => {
    const { pathname, search } = new URL(url);
    return answers[`${pathname}${search}`]?.(url) ?? page(url, 404);
  });
}
const to = (status: number, location: string | null) => (url: string) => moved(url, status, location);
const row = (over: Partial<SavedRedirect> = {}): SavedRedirect => ({ fromPath: "/old", toPath: "/new", statusCode: 301, ...over });
const classify = (saved: SavedRedirect, fetch: MigrationFetcher, extra: { movingHost?: string; maxHops?: number } = {}) =>
  classifyRedirect(saved, { targetOrigin: SHOP, fetch, ...extra });
const urls = (fetch: ReturnType<typeof site>) => fetch.mock.calls.map((c) => c[0]);

describe("redirect.imported, a row at a time", () => {
  it("one 301 to a 200 passes", async () => {
    const r = await classify(row(), site({ "/old": to(301, "/new"), "/new": page }));
    expect(r).toMatchObject({ fromPath: "/old", toPath: "/new", saved: 301, class: "landed", status: "pass", http: 200, finalUrl: `${SHOP}/new` });
    expect(r.hops).toEqual([{ url: `${SHOP}/old`, status: 301 }, { url: `${SHOP}/new`, status: 200 }]);
  });

  it.each([300, 302, 303, 307, 308])("a saved %i is judged as saved", async (statusCode) => {
    expect(await classify(row({ statusCode }), site({ "/old": to(statusCode, "/new"), "/new": page }))).toMatchObject({ class: "landed", status: "pass", saved: statusCode });
  });

  it("two hops fail, naming the row and every hop", async () => {
    const r = await classify(row(), site({ "/old": to(301, "/new"), "/new": to(301, "/newer"), "/newer": page }));
    expect(r).toMatchObject({ fromPath: "/old", class: "chain", status: "fail" });
    expect(r.hops.map((h) => h.status)).toEqual([301, 301, 200]);
    expect(r.detail).toBe("2 redirects, then HTTP 200");
  });

  it("a temporary second hop is a chain too: a shop on the default locale prefix", async () => {
    const r = await classify(row(), site({ "/old": to(301, "/new"), "/new": to(307, `/${L}/new`), [`/${L}/new`]: page }));
    expect(r).toMatchObject({ class: "chain", status: "fail" });
  });

  it("a loop fails and says where it came back to", async () => {
    const two = await classify(row(), site({ "/old": to(301, "/new"), "/new": to(301, "/old") }));
    expect(two).toMatchObject({ class: "loop", status: "fail", detail: `comes back to ${SHOP}/old` });
    const self = await classify(row({ toPath: "/old" }), site({ "/old": to(301, "/old") }));
    expect(self).toMatchObject({ class: "loop", status: "fail" });
    expect(self.hops).toHaveLength(1);
  });

  it.each([400, 403, 404, 410, 201, 202, 203, 204, 206])("a target answering %i fails: only 200 lands", async (status) => {
    const r = await classify(row(), site({ "/old": to(301, "/new"), "/new": (u) => page(u, status) }));
    expect(r).toMatchObject({ class: "bad-landing", status: "fail", http: status, detail: `the target answers HTTP ${status}` });
  });

  it("a wrong status fails, and nothing further is requested", async () => {
    const fetch = site({ "/old": to(302, "/new"), "/new": page });
    const r = await classify(row(), fetch);
    expect(r).toMatchObject({ class: "wrong-status", status: "fail", http: 302 });
    expect(r.detail).toContain("saved: 301 to /new");
    expect(urls(fetch)).toEqual([`${SHOP}/old`]);
  });

  it.each([200, 404])("no redirect at all (HTTP %i) is a wrong status, not a page that passes", async (status) => {
    expect(await classify(row(), site({ "/old": (u) => page(u, status) }))).toMatchObject({ class: "wrong-status", status: "fail", http: status });
  });

  it("a saved status that is no redirect never passes on a page that answers it", async () => {
    expect(await classify(row({ statusCode: 200 }), site({ "/old": page }))).toMatchObject({ class: "wrong-status", status: "fail" });
  });

  it.each([200, 204, 400, 404, 410])("a saved %i is no redirect, even answered with a Location to a page", async (statusCode) => {
    const fetch = site({ "/old": to(statusCode, "/new"), "/new": page });
    expect(await classify(row({ statusCode }), fetch)).toMatchObject({ class: "wrong-status", status: "fail", http: statusCode });
    expect(urls(fetch)).toEqual([`${SHOP}/old`]);
  });

  it("the saved status to another target fails, and the other target is not requested", async () => {
    const fetch = site({ "/old": to(301, "/elsewhere"), "/elsewhere": page });
    const r = await classify(row(), fetch);
    expect(r).toMatchObject({ class: "wrong-target", status: "fail" });
    expect(r.detail).toContain(`redirects to ${SHOP}/elsewhere; saved: /new`);
    expect(urls(fetch)).toEqual([`${SHOP}/old`]);
  });

  it("a query is part of the target", async () => {
    expect(await classify(row({ toPath: "/new?a=1" }), site({ "/old": to(301, "/new?a=2"), "/new?a=2": page }))).toMatchObject({ class: "wrong-target" });
    expect(await classify(row({ toPath: "/new?a=1" }), site({ "/old": to(301, "/new?a=1"), "/new?a=1": page }))).toMatchObject({ class: "landed" });
  });

  it("a trailing slash and the locale are how the proxy writes a target, not another target; the hop they cost is counted", async () => {
    expect(await classify(row(), site({ "/old": to(301, "/new/"), "/new/": page }))).toMatchObject({ class: "landed" });
    expect(await classify(row({ toPath: "/new/" }), site({ "/old": to(301, "/new"), "/new": page }))).toMatchObject({ class: "landed" });
    expect(await classify(row(), site({ "/old": to(301, `/${L}/new`), [`/${L}/new`]: page }))).toMatchObject({ class: "landed" });
    expect(await classify(row({ toPath: `/${L}/new` }), site({ "/old": to(301, "/new"), "/new": page }))).toMatchObject({ class: "landed" });
    expect(await classify(row(), site({ "/old": to(301, "/new"), "/new": to(308, "/new/"), "/new/": page }))).toMatchObject({ class: "chain" });
  });

  it("a target percent-encoded by the proxy is the saved one", async () => {
    expect(await classify(row({ toPath: "/æbler" }), site({ "/old": to(301, "/%C3%A6bler"), "/%C3%A6bler": page }))).toMatchObject({ class: "landed" });
  });

  it("no Location, or one that cannot be read, is an error row", async () => {
    expect(await classify(row(), site({ "/old": to(301, null) }))).toMatchObject({ class: "error", status: "fail" });
    expect(await classify(row(), site({ "/old": to(301, "http://[bad") }))).toMatchObject({ class: "error", status: "fail" });
  });

  it("a refused or empty answer is an error row, at the first hop and at the target", async () => {
    const refused: MigrationFetcher = async (url) => ({ outcome: "refused", url, status: 0, reason: "foreign-host" });
    expect(await classify(row(), refused)).toMatchObject({ class: "error", status: "fail", detail: "foreign-host" });
    const empty = site({ "/old": to(301, "/new"), "/new": (url) => ({ outcome: "error", url, status: 200, reason: "empty body" }) });
    expect(await classify(row(), empty)).toMatchObject({ class: "error", status: "fail", detail: "empty body" });
  });

  it.each([0, 429, 503])("HTTP %i is inconclusive, never a fail: at the first hop and at the target", async (status) => {
    expect(await classify(row(), site({ "/old": (u) => down(u, status) }))).toMatchObject({ class: "inconclusive", status: "inconclusive", http: status });
    expect(await classify(row(), site({ "/old": to(301, "/new"), "/new": (u) => down(u, status) }))).toMatchObject({ class: "inconclusive", status: "inconclusive" });
  });

  it("two redirects stay a chain whatever the next hop answers", async () => {
    const fetch = site({ "/old": to(301, "/new"), "/new": to(301, "/newer"), "/newer": (u) => down(u) });
    expect(await classify(row(), fetch)).toMatchObject({ class: "chain", status: "fail" });
    expect(await classify(row(), site({ "/old": to(301, "/new"), "/new": to(301, "/newer") }))).toMatchObject({ class: "chain", detail: "2 redirects, then HTTP 404" });
  });

  it("a target answering 300 with no Location still redirects: a chain, not a bad landing", async () => {
    expect(await classify(row(), site({ "/old": to(301, "/new"), "/new": to(300, null) }))).toMatchObject({ class: "chain", status: "fail", detail: "the target redirects again (HTTP 300)" });
  });

  it("stops at the hop cap: a long chain is bounded, and still a chain", async () => {
    const answers = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`/p${i}`, to(301, `/p${i + 1}`)]));
    const fetch = site({ ...answers, "/old": to(301, "/p0") });
    const r = await classify(row({ toPath: "/p0" }), fetch, { maxHops: 3 });
    expect(r).toMatchObject({ class: "chain", status: "fail" });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  describe("the host binding", () => {
    it("a saved target on another site answers as saved and is never requested: inconclusive, not a pass", async () => {
      const fetch = site({ "/old": to(301, "https://partner.example.test/x") });
      const r = await classify(row({ toPath: "https://partner.example.test/x" }), fetch);
      expect(r).toMatchObject({ class: "external", status: "inconclusive", finalUrl: "https://partner.example.test/x" });
      expect(urls(fetch)).toEqual([`${SHOP}/old`]);
    });

    it("a relative saved target redirected off the site is a wrong target, and is never requested", async () => {
      const fetch = site({ "/old": to(301, "https://other.example.test/new") });
      expect(await classify(row(), fetch)).toMatchObject({ class: "wrong-target", status: "fail" });
      expect(urls(fetch)).toEqual([`${SHOP}/old`]);
    });

    it("a target off the site after the first hop is a chain, and is never requested", async () => {
      const fetch = site({ "/old": to(301, "/new"), "/new": to(301, "https://other.example.test/x") });
      expect(await classify(row(), fetch)).toMatchObject({ class: "chain", status: "fail" });
      expect(urls(fetch)).toEqual([`${SHOP}/old`, `${SHOP}/new`]);
    });

    it("an https target downgraded to http is another origin", async () => {
      const fetch = site({ "/old": to(301, "http://shop.example.test/new") });
      expect(await classify(row(), fetch)).toMatchObject({ class: "wrong-target", status: "fail" });
      expect(urls(fetch)).toEqual([`${SHOP}/old`]);
    });

    it("a target on the domain that moves is measured on the new site: the redirect CSV's feed rows", async () => {
      for (const prod of ["https://old.example.test/feed/google.xml", "https://www.old.example.test/feed/google.xml"]) {
        const fetch = site({ "/feed": to(301, prod), "/feed/google.xml": page });
        const r = await classify(row({ fromPath: "/feed", toPath: prod }), fetch, { movingHost: "old.example.test" });
        expect(r, prod).toMatchObject({ class: "landed", status: "pass" });
        expect(urls(fetch), prod).toEqual([`${SHOP}/feed`, `${SHOP}/feed/google.xml`]);
      }
    });

    it("that same target, with no domain moving or another one, is another site", async () => {
      const prod = "https://old.example.test/feed/google.xml";
      const fetch = site({ "/feed": to(301, prod), "/feed/google.xml": page });
      expect(await classify(row({ fromPath: "/feed", toPath: prod }), fetch)).toMatchObject({ class: "external" });
      expect(await classify(row({ fromPath: "/feed", toPath: prod }), fetch, { movingHost: "another.example.test" })).toMatchObject({ class: "external" });
    });

    it("that domain on http is not measured, and never passes: after the switch it is plain http or one more redirect", async () => {
      for (const http of ["http://old.example.test/feed/google.xml", "http://www.old.example.test/feed/google.xml"]) {
        const fetch = site({ "/feed": to(301, http), "/feed/google.xml": page });
        const r = await classify(row({ fromPath: "/feed", toPath: http }), fetch, { movingHost: "old.example.test" });
        expect(r, http).toMatchObject({ class: "external", status: "inconclusive", finalUrl: http, detail: expect.stringContaining("is not on the new site's scheme") });
        expect(urls(fetch), http).toEqual([`${SHOP}/feed`]);
      }
    });

    it("so is the new site's own host on http, once it is the domain that moves", async () => {
      const http = "http://shop.example.test/new";
      const fetch = site({ "/old": to(301, http), "/new": page });
      expect(await classify(row({ toPath: http }), fetch, { movingHost: "shop.example.test" })).toMatchObject({ class: "external", status: "inconclusive" });
      expect(urls(fetch)).toEqual([`${SHOP}/old`]);
    });

    it("another port on that domain is another site, however the new site answers the path", async () => {
      const prod = "https://old.example.test:8443/feed/google.xml";
      const fetch = site({ "/feed": to(301, prod), "/feed/google.xml": page });
      const r = await classify(row({ fromPath: "/feed", toPath: prod }), fetch, { movingHost: "old.example.test" });
      expect(r).toMatchObject({ class: "external", status: "inconclusive", detail: expect.stringContaining("https://old.example.test:8443 is another site") });
      expect(urls(fetch)).toEqual([`${SHOP}/feed`]);
    });

    it("the scheme is held against the new site's, not a fixed one, and its port stays its own", async () => {
      const on = (targetOrigin: string, prod: string) => {
        const fetch = site({ "/feed": to(301, prod), "/feed/google.xml": page });
        return { fetch, result: classifyRedirect(row({ fromPath: "/feed", toPath: prod }), { targetOrigin, fetch, movingHost: "old.example.test" }) };
      };
      const plain = on("http://shop.example.test", "http://old.example.test/feed/google.xml");
      expect(await plain.result).toMatchObject({ class: "landed", status: "pass" });
      expect(urls(plain.fetch)).toEqual(["http://shop.example.test/feed", "http://shop.example.test/feed/google.xml"]);
      expect(await on("http://shop.example.test", "https://old.example.test/feed/google.xml").result).toMatchObject({ class: "external", status: "inconclusive" });
      const ported = on("https://shop.example.test:8443", "https://old.example.test/feed/google.xml");
      expect(await ported.result).toMatchObject({ class: "landed", status: "pass" });
      expect(urls(ported.fetch)).toEqual(["https://shop.example.test:8443/feed", "https://shop.example.test:8443/feed/google.xml"]);
    });

    it("a target redirecting to that domain on http is a chain, and that address is not asked on the new site; on https it is, so a loop shows", async () => {
      const fetch = site({ "/old": to(301, "/new"), "/new": to(301, "http://old.example.test/newer"), "/newer": page });
      expect(await classify(row(), fetch, { movingHost: "old.example.test" })).toMatchObject({ class: "chain", status: "fail" });
      expect(urls(fetch)).toEqual([`${SHOP}/old`, `${SHOP}/new`]);
      const back = site({ "/old": to(301, "/new"), "/new": to(301, "https://old.example.test/old") });
      expect(await classify(row(), back, { movingHost: "old.example.test" })).toMatchObject({ class: "loop", status: "fail" });
    });

    it("a query on that domain travels with the target", async () => {
      const prod = "https://old.example.test/feed/google.xml?lang=en";
      const fetch = site({ "/feed": to(301, prod), "/feed/google.xml?lang=en": page });
      expect(await classify(row({ fromPath: "/feed", toPath: prod }), fetch, { movingHost: "old.example.test" })).toMatchObject({ class: "landed", status: "pass" });
      expect(urls(fetch)).toEqual([`${SHOP}/feed`, `${SHOP}/feed/google.xml?lang=en`]);
    });

    it("a source written like a network-path reference stays a path on the new site", async () => {
      const fetch = vi.fn<MigrationFetcher>(async (url) => page(url, 404));
      await classify(row({ fromPath: "//evil.example.test/a" }), fetch);
      expect(new URL(fetch.mock.calls[0][0]).origin).toBe(SHOP);
    });

    it("a source that is not a path is an error row, and nothing is requested", async () => {
      const fetch = site({});
      for (const fromPath of ["old", "@evil.example.test/a", ""]) {
        expect(await classify(row({ fromPath }), fetch), fromPath).toMatchObject({ class: "error", status: "fail", http: 0, hops: [] });
      }
      expect(await classifyRedirect(row(), { targetOrigin: "not a url", fetch })).toMatchObject({ class: "error", status: "fail" });
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  it("the summary sums across chunks and keeps the first 20 non-passes, fails first", () => {
    const res = (fromPath: string, cls: "landed" | "chain" | "inconclusive") => ({
      fromPath, toPath: "/new", saved: 301, finalUrl: "", class: cls,
      status: cls === "landed" ? ("pass" as const) : cls === "chain" ? ("fail" as const) : ("inconclusive" as const), http: 200, hops: [],
    });
    const first = mergeRedirectSummary(null, [res("/a", "landed"), res("/b", "inconclusive")]);
    const next = mergeRedirectSummary(first, [res("/c", "chain"), res("/d", "landed")]);
    expect(next).toMatchObject({ processed: 4, counts: { pass: 2, fail: 1, inconclusive: 1 }, classes: { landed: 2, chain: 1, inconclusive: 1 } });
    expect(next.firstErrors.map((r) => r.fromPath)).toEqual(["/c", "/b"]);
    const many = mergeRedirectSummary(next, Array.from({ length: 30 }, (_, i) => res(`/x${i}`, "chain")));
    expect(many.firstErrors).toHaveLength(20);
    expect(many.firstErrors[0].fromPath).toBe("/c");
  });
});

describe("redirect.active, the first answer", () => {
  const probe = (saved: SavedRedirect, fetch: MigrationFetcher) => probeRedirect(saved, { targetOrigin: SHOP, fetch });

  it("the saved status to the saved target is served, wherever it lands", async () => {
    const fetch = site({ "/old": to(301, "/new") });
    expect(await probe(row(), fetch)).toMatchObject({ answer: "served" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("anything else is not served, and says what it answered; no answer is inconclusive", async () => {
    expect(await probe(row(), site({ "/old": (u) => page(u, 404) }))).toMatchObject({ answer: "not-served", detail: expect.stringContaining("answers HTTP 404") });
    expect(await probe(row(), site({ "/old": to(301, "/elsewhere") }))).toMatchObject({ answer: "not-served" });
    expect(await probe(row({ fromPath: "old" }), site({}))).toMatchObject({ answer: "not-served" });
    expect(await probe(row(), site({ "/old": (u) => down(u) }))).toMatchObject({ answer: "inconclusive" });
  });
});

describe("a shop with two locales: the proxy adds or drops one, it never swaps them", () => {
  /** A module graph that routes by `da` and `en`, in a tree with any locales: a scaffold has one. */
  const twoLocales = async () => {
    const actual = await vi.importActual<typeof import("@/brand.config")>("@/brand.config");
    vi.doMock("@/brand.config", () => ({ ...actual, brand: { ...actual.brand, locales: ["da", "en"], defaultLocale: "da" } }));
    vi.resetModules();
    return import("@/lib/migration/checks/redirect");
  };
  afterEach(() => {
    vi.doUnmock("@/brand.config");
    vi.resetModules();
  });
  const uk = (toPath: string) => row({ fromPath: "/uk", toPath });

  it.each([
    ["/en/news", "/da/news"],
    ["/da/news", "/en/news"],
    ["/en/news/", "/da/news"],
    ["/en", "/da"],
    ["/en/news?a=1", "/da/news?a=1"],
  ])("saved %s, answered %s: a wrong target, named, that is not requested and not served", async (toPath, location) => {
    const { classifyRedirect, probeRedirect } = await twoLocales();
    const fetch = site({ "/uk": to(301, location), [location]: page });
    expect(await classifyRedirect(uk(toPath), { targetOrigin: SHOP, fetch })).toMatchObject({ class: "wrong-target", status: "fail", detail: `redirects to ${SHOP}${location}; saved: ${toPath}` });
    expect(urls(fetch)).toEqual([`${SHOP}/uk`]);
    expect(await probeRedirect(uk(toPath), { targetOrigin: SHOP, fetch })).toMatchObject({ answer: "not-served" });
  });

  it.each([
    ["/en/news", "/en/news"],
    ["/en/news/", "/en/news"],
    ["/en/news", "/news"],
    ["/news", "/en/news"],
    ["/news", "/da/news"],
    ["/da", "/da/"],
    ["/en", "/"],
  ])("saved %s, answered %s: the same target, a locale on one side at most or the same on both", async (toPath, location) => {
    const { classifyRedirect, probeRedirect } = await twoLocales();
    const fetch = site({ "/uk": to(301, location), [location]: page });
    expect(await classifyRedirect(uk(toPath), { targetOrigin: SHOP, fetch })).toMatchObject({ class: "landed", status: "pass" });
    expect(await probeRedirect(uk(toPath), { targetOrigin: SHOP, fetch })).toMatchObject({ answer: "served" });
  });

  it("a segment that is no configured locale is part of the path: /fr is another target here, and the locale the proxy adds in front of it is its own", async () => {
    const { classifyRedirect } = await twoLocales();
    const answered = (toPath: string, location: string) => classifyRedirect(uk(toPath), { targetOrigin: SHOP, fetch: site({ "/uk": to(301, location), [location]: page }) });
    expect(await answered("/en/news", "/fr/news")).toMatchObject({ class: "wrong-target", status: "fail" });
    expect(await answered("/fr/news", "/da/fr/news")).toMatchObject({ class: "landed", status: "pass" });
  });

  it("another site's locale is held the same way: a swap there does not answer as saved", async () => {
    const { classifyRedirect } = await twoLocales();
    const partner = (location: string) => classifyRedirect(row({ toPath: "https://partner.example.test/en/p" }), { targetOrigin: SHOP, fetch: site({ "/old": to(301, location) }) });
    expect(await partner("https://partner.example.test/da/p")).toMatchObject({ class: "wrong-target", status: "fail" });
    expect(await partner("https://partner.example.test/en/p")).toMatchObject({ class: "external", status: "inconclusive" });
  });

  it("so is the domain that moves: a swap there is not measured on the new site", async () => {
    const { classifyRedirect } = await twoLocales();
    const saved = row({ toPath: "https://old.example.test/en/p" });
    const swapped = site({ "/old": to(301, "https://old.example.test/da/p"), "/da/p": page });
    expect(await classifyRedirect(saved, { targetOrigin: SHOP, fetch: swapped, movingHost: "old.example.test" })).toMatchObject({ class: "wrong-target", status: "fail" });
    expect(urls(swapped)).toEqual([`${SHOP}/old`]);
    const same = site({ "/old": to(301, "https://old.example.test/en/p"), "/en/p": page });
    expect(await classifyRedirect(saved, { targetOrigin: SHOP, fetch: same, movingHost: "old.example.test" })).toMatchObject({ class: "landed", status: "pass" });
  });
});

describe("judgeRedirectActive", () => {
  const saved = [row(), row({ fromPath: "/b", toPath: "/c" })];
  const inMap = { "/old": { to: "/new", status: 301 }, "/b": { to: "/c", status: 301 } };
  const served = (rows: readonly SavedRedirect[]): RedirectProbe[] => rows.map((r) => ({ row: r, answer: "served" }));
  const judge = (over: Partial<Parameters<typeof judgeRedirectActive>[0]> = {}) =>
    judgeRedirectActive({ saved, store: "database", served: inMap, probes: served(saved), sample: saved.length, ...over });

  it.each(["database", "redis"] as const)("%s: in the store and answering is active", (store) => {
    expect(judge({ store })).toMatchObject({ status: "pass", state: "active", store, saved: 2, inStore: 2, probed: 2, answering: 2, notActive: { count: 0, first: [] } });
  });

  it("nothing saved is skip, never a pass", () => {
    expect(judge({ saved: [], served: {}, probes: [], sample: 0 })).toMatchObject({ status: "skip", state: "nothing-saved" });
  });

  it("Redis without the row: saved but not active, named, however the site answered", () => {
    const r = judge({ store: "redis", served: { "/b": inMap["/b"] } });
    expect(r).toMatchObject({ status: "warn", state: "saved-not-active", store: "redis", inStore: 1 });
    expect(r.notActive).toEqual({ count: 1, first: [{ fromPath: "/old", toPath: "/new", why: "not-in-store" }] });
    expect(r.detail).toContain("reads the Redis map");
    expect(judge({ store: "redis", served: {} })).toMatchObject({ status: "warn", state: "saved-not-active", notActive: { count: 2 } });
  });

  it("the store holding another target or status for a row is saved but not active too", () => {
    expect(judge({ store: "redis", served: { ...inMap, "/old": { to: "/stale", status: 301 } } }).notActive.first).toEqual([
      { fromPath: "/old", toPath: "/new", why: "differs-in-store", detail: "the store has 301 to /stale" },
    ]);
    expect(judge({ store: "redis", served: { ...inMap, "/old": { to: "/new", status: 302 } } }).notActive.first[0]).toMatchObject({ why: "differs-in-store" });
  });

  it("without Upstash, a site that does not answer as saved: saved but not active, named, never a pass", () => {
    const probes: RedirectProbe[] = [{ row: saved[0], answer: "not-served", detail: "answers HTTP 404; saved: 301 to /new" }, { row: saved[1], answer: "served" }];
    const r = judge({ probes });
    expect(r).toMatchObject({ status: "warn", state: "saved-not-active", store: "database", inStore: 2, answering: 1 });
    expect(r.notActive.first).toEqual([{ fromPath: "/old", toPath: "/new", why: "not-answering", detail: "answers HTTP 404; saved: 301 to /new" }]);
    expect(r.detail).toContain("reads the Redirect table");
    expect(r.detail).toContain("older than that read (v0.62.0)");
    expect(r.detail).toContain("up to 60 s old");
  });

  it("a row missing from the store and not answering is named once, for the store", () => {
    const probes: RedirectProbe[] = [{ row: saved[0], answer: "not-served" }, { row: saved[1], answer: "served" }];
    expect(judge({ store: "redis", served: { "/b": inMap["/b"] }, probes }).notActive).toEqual({ count: 1, first: [{ fromPath: "/old", toPath: "/new", why: "not-in-store" }] });
  });

  it("a store that cannot be read, and every row asked answering as saved, is inconclusive, never a pass or a warn about a row", () => {
    expect(judge({ store: "redis", served: null })).toMatchObject({ status: "inconclusive", state: "not-measured", inStore: 0, notActive: { count: 0 }, detail: "The Redis map could not be read, so what the proxy serves is not known." });
    expect(judge({ store: "database", served: null })).toMatchObject({ status: "inconclusive", state: "not-measured" });
  });

  it("a store that cannot be read hides nothing the site said: a row not answering as saved is still the warn, counted over the rows asked", () => {
    const probes: RedirectProbe[] = [{ row: saved[0], answer: "not-served", detail: "answers HTTP 404; saved: 301 to /new" }, { row: saved[1], answer: "served" }];
    const r = judge({ saved: [...saved, row({ fromPath: "/d", toPath: "/e" })], store: "redis", served: null, probes, sample: 3 });
    expect(r).toMatchObject({ status: "warn", state: "saved-not-active", store: "redis", saved: 3, inStore: 0, probed: 2, answering: 1 });
    expect(r.notActive).toEqual({ count: 1, first: [{ fromPath: "/old", toPath: "/new", why: "not-answering", detail: "answers HTTP 404; saved: 301 to /new" }] });
    expect(r.detail).toContain("1 of the 2 saved redirects asked");
    expect(r.detail).toContain("The Redis map could not be read, so the rest are not known");
    expect(r.detail).toContain("up to 60 s old");
    expect(r.detail).not.toContain("reads the Redis map");
    expect(judge({ store: "database", served: null, probes })).toMatchObject({ status: "warn", detail: expect.stringContaining("The Redirect table could not be read") });
  });

  it.each(["redis", "database"] as const)("%s: nothing saved and a store that cannot be read is inconclusive, since a map nobody saved may still be served", (store) => {
    expect(judge({ saved: [], store, served: null, probes: [], sample: 0 })).toMatchObject({ status: "inconclusive", state: "not-measured", saved: 0, servedNotSaved: [] });
  });

  it("a site that does not answer, or a sample not finished, is inconclusive", () => {
    expect(judge({ probes: [{ row: saved[0], answer: "inconclusive" }, { row: saved[1], answer: "served" }] })).toMatchObject({ status: "inconclusive", state: "not-measured" });
    expect(judge({ probes: served(saved.slice(0, 1)) })).toMatchObject({ status: "inconclusive", state: "not-measured" });
    expect(judge({ probes: [] })).toMatchObject({ status: "inconclusive", state: "not-measured" });
  });

  it("a known row not active outranks a sample that did not finish: the verdict cannot get better", () => {
    expect(judge({ store: "redis", served: {}, probes: [] })).toMatchObject({ status: "warn", state: "saved-not-active" });
  });

  it("the store serving a source nothing saved: a warn that names it, also with nothing saved", () => {
    const extra = { ...inMap, "/stale": { to: "/x", status: 301 } };
    expect(judge({ store: "redis", served: extra })).toMatchObject({ status: "warn", state: "served-not-saved", servedNotSaved: ["/stale"] });
    expect(judge({ saved: [], store: "redis", served: { "/stale": { to: "/x", status: 301 } }, probes: [], sample: 0 })).toMatchObject({ status: "warn", state: "served-not-saved" });
  });

  it("names at most 20 rows and counts them all", () => {
    const many = Array.from({ length: 30 }, (_, i) => row({ fromPath: `/p${i}` }));
    const r = judge({ saved: many, store: "redis", served: {}, probes: [], sample: 0 });
    expect(r.notActive.count).toBe(30);
    expect(r.notActive.first).toHaveLength(20);
  });
});

describe("bindingsFor", () => {
  const current = { snapshotId: "s", configHash: "c", buildSha: "b", redirectsHash: "h" };
  const of = (id: string) => CHECK_CATALOG.find((r) => r.id === id);

  it("only the checks that measure the saved redirects are judged on their hash", () => {
    for (const id of ["redirect.imported", "redirect.active"]) expect(bindingsFor(of(id), current), id).toEqual(current);
    for (const id of ["redirect.legacy-shadow", "url.parity", "data.counts"]) expect(bindingsFor(of(id), current).redirectsHash, id).toBeUndefined();
    expect(bindingsFor(undefined, current).redirectsHash).toBeUndefined();
    expect(bindingsFor(of("pay.test-order"), current)).toEqual({ snapshotId: "s", configHash: "c" });
  });

  it("a pass that measured other redirects is stale; one with no hash is too, once there is one to judge", () => {
    const pass = (redirectsHash?: string) => ({ checkId: "redirect.imported", status: "pass", finishedAt: new Date(), bindings: { snapshotId: "s", redirectsHash } });
    const now = new Date(Date.now() + 1000);
    const judged = bindingsFor(of("redirect.imported"), { snapshotId: "s", redirectsHash: "h" });
    expect(isFreshPass(pass("h"), now, judged)).toBe(true);
    expect(isFreshPass(pass("other"), now, judged)).toBe(false);
    expect(isFreshPass(pass(), now, judged)).toBe(false);
  });
});

describe("redirect.legacy-shadow", () => {
  const judge = (paths: string[], permalinks: Record<string, unknown> | null = null) => judgeLegacyShadow({ paths, permalinks });

  it("a frozen path under a legacy slug fails, named, with the permalink branch off", () => {
    const r = judge(["/hegn/type-1/", "/produkt/type-1/"]);
    expect(r).toMatchObject({ status: "fail", permalinkBranch: false, checked: 2, servedByPermalink: 0 });
    expect(r.shadowed).toEqual({ count: 1, first: [{ path: "/produkt/type-1/", segment: "produkt" }] });
    expect(r.detail).toContain("the permalink branch (brand.urls.permalinks) is off");
  });

  it.each(["konto", "kurv", "ordre", "kategori", "produkt", "kontakt", "anmeld"])("/%s is a legacy slug, bare and with a rest", (segment) => {
    expect(judge([`/${segment}`]).status).toBe("fail");
    expect(judge([`/${segment}/`]).status).toBe("fail");
    expect(judge([`/${segment}/x/y/`]).status).toBe("fail");
  });

  it("the slug is the whole first segment: a longer name, or the name deeper down, is not under it", () => {
    expect(judge(["/produkter/", "/produkt-a/", "/kurve/", "/hegn/produkt/", "/hegn/kontakt"])).toMatchObject({ status: "pass", shadowed: { count: 0 } });
  });

  it("the locale in front counts, as both proxies read it, and a variant's query does not hide the path", () => {
    expect(judge([`/${L}/produkt/x/`]).status).toBe("fail");
    expect(judge(["/produkt/x/?attribute_pa_farve=sort"]).shadowed.first).toEqual([{ path: "/produkt/x/?attribute_pa_farve=sort", segment: "produkt" }]);
    expect(judge(["/produkt?attribute_pa_farve=sort"]).status).toBe("fail");
    expect(judge(["/produkt/x/?bredde=1.5"]).status).toBe("fail");
    expect(judge(["/hegn/?produkt=/produkt/x"]).status).toBe("pass");
  });

  it("a dotted path never reaches the proxy, so the legacy rule does not answer it", () => {
    expect(judge(["/produkt/katalog.pdf"]).status).toBe("pass");
  });

  it("with the permalink branch on, a stored permalink answers first and passes", () => {
    const r = judge(["/produkt/x/", "/hegn/y/"], { "/produkt/x": { kind: "product", slug: "x" } });
    expect(r).toMatchObject({ status: "pass", permalinkBranch: true, checked: 2, servedByPermalink: 1, shadowed: { count: 0 } });
  });

  it("with the branch on, a path no product or category stores still meets the legacy 301, and fails", () => {
    const r = judge(["/produkt/x/", "/produkt/gone/"], { "/produkt/x": { kind: "product", slug: "x" } });
    expect(r).toMatchObject({ status: "fail", permalinkBranch: true, servedByPermalink: 1 });
    expect(r.shadowed.first).toEqual([{ path: "/produkt/gone/", segment: "produkt" }]);
    expect(r.detail).toContain("no product or category stores it");
    expect(judge(["/produkt/x/"], {})).toMatchObject({ status: "fail", permalinkBranch: true });
  });

  it("no frozen path is skip, never a pass", () => {
    expect(judge([])).toMatchObject({ status: "skip", checked: 0 });
    expect(judge([], {})).toMatchObject({ status: "skip" });
  });

  it("names at most 20 and counts them all", () => {
    const r = judge(Array.from({ length: 30 }, (_, i) => `/produkt/p${i}/`));
    expect(r.shadowed.count).toBe(30);
    expect(r.shadowed.first).toHaveLength(20);
  });
});
