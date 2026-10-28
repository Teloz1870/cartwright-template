import { describe, expect, it } from "vitest";

import type { MigrationFetcher, MigrationResponse } from "@/lib/migration/fetch";
import {
  classifyUrl,
  isVariantQuery,
  summarizeUrlParity,
  type UrlParityEntry,
  type UrlParityResult,
} from "@/lib/migration/checks/url";

/**
 * MIGD-1b — the `url.parity` classifier. Status-first: a 3xx is an answer, never
 * a page; 000/5xx/429 is inconclusive (a host that is down never fails a row).
 * The new host is scripted per path+query; anything unscripted answers 404.
 */

const OLD = "https://old.example.test";
const NEW = "https://new.example.test";

type Route = (url: string) => MigrationResponse;
const answer = (status: number, location: string | null = null, body = ""): Route => (url) => ({
  outcome: "answer",
  url,
  status,
  location,
  contentType: "text/html",
  body,
  truncated: false,
});
const page = answer(200, null, "<h1>Alpha</h1>");
const noAnswer =
  (status: number, reason: string): Route =>
  (url) => ({ outcome: "inconclusive", url, status, reason });

function newHost(routes: Record<string, Route>): { fetch: MigrationFetcher; calls: string[] } {
  const calls: string[] = [];
  const fetch: MigrationFetcher = async (raw) => {
    calls.push(raw);
    const u = new URL(raw);
    return (routes[u.pathname + u.search] ?? answer(404))(raw);
  };
  return { fetch, calls };
}

async function classify(path: string, routes: Record<string, Route>, extra: Partial<UrlParityEntry> = {}) {
  const host = newHost(routes);
  const result = await classifyUrl({ oldUrl: OLD + path, ...extra }, { targetOrigin: NEW, fetch: host.fetch });
  return { result, calls: host.calls };
}

describe("url.parity — the classification table", () => {
  it.each([
    ["200 = same", { "/produkt/alpha/": page }, "same", "same", "pass"],
    [
      "308→200 = same-modulo-slash (warn)",
      { "/produkt/alpha/": answer(308, "/produkt/alpha"), "/produkt/alpha": page },
      "same",
      "same-modulo-slash",
      "warn",
    ],
    [
      "301→200 = redirect, ok when expect=301",
      { "/produkt/alpha/": answer(301, "/da/produkter/alpha"), "/da/produkter/alpha": page },
      "301",
      "redirect",
      "pass",
    ],
    [
      "301→200 = redirect, a fail when the row expects the same path",
      { "/produkt/alpha/": answer(301, "/da/produkter/alpha"), "/da/produkter/alpha": page },
      "same",
      "redirect",
      "fail",
    ],
    [
      "301→301 = chain (fail), even with expect=301",
      { "/produkt/alpha/": answer(301, "/b/"), "/b/": answer(301, "/c/"), "/c/": page },
      "301",
      "chain",
      "fail",
    ],
    ["404 = missing", {}, "same", "missing", "fail"],
    ["000 = inconclusive, never fail", { "/produkt/alpha/": noAnswer(0, "timeout") }, "same", "inconclusive", "inconclusive"],
  ] as const)("%s", async (_name, routes, expectRow, cls, status) => {
    const { result } = await classify("/produkt/alpha/", routes, { expect: expectRow });
    expect(result.class).toBe(cls);
    expect(result.status).toBe(status);
  });

  it("records the hop chain it followed, against the NEW host", async () => {
    const { result } = await classify("/produkt/alpha/", {
      "/produkt/alpha/": answer(308, "/produkt/alpha"),
      "/produkt/alpha": page,
    });
    expect(result.targetUrl).toBe(`${NEW}/produkt/alpha/`);
    expect(result.hops).toEqual([
      { url: `${NEW}/produkt/alpha/`, status: 308 },
      { url: `${NEW}/produkt/alpha`, status: 200 },
    ]);
    expect(result.http).toBe(200);
    expect(result.finalUrl).toBe(`${NEW}/produkt/alpha`);
  });

  it("a 3xx carrying an HTML stub is still a redirect, never a page", async () => {
    const stub = answer(301, "/da/produkter/alpha", "<html><body>301 Moved Permanently</body></html>");
    const { result } = await classify("/produkt/alpha/", { "/produkt/alpha/": stub, "/da/produkter/alpha": page });
    expect(result.class).toBe("redirect");
    expect(result.hops.map((h) => h.status)).toEqual([301, 200]);
  });

  it("the measured Woo path today, 308 → 307 → 404, is missing — the 404 is the finding", async () => {
    const { result } = await classify("/produkt/alpha/", {
      "/produkt/alpha/": answer(308, "/produkt/alpha"),
      "/produkt/alpha": answer(307, "/da/produkt/alpha"),
    });
    expect(result.class).toBe("missing");
    expect(result.status).toBe("fail");
    expect(result.hops.map((h) => h.status)).toEqual([308, 307, 404]);
  });

  it("a 5xx or 429 anywhere in the chain is inconclusive, never fail", async () => {
    for (const status of [503, 429]) {
      const { result } = await classify("/produkt/alpha/", {
        "/produkt/alpha/": answer(301, "/b/"),
        "/b/": noAnswer(status, `HTTP ${status}`),
      });
      expect(result.status, String(status)).toBe("inconclusive");
    }
  });

  it("follows at most 3 hops: a redirect loop is a chain after 4 requests", async () => {
    const { result, calls } = await classify("/a/", { "/a/": answer(301, "/b/"), "/b/": answer(301, "/a/") });
    expect(result.class).toBe("chain");
    expect(result.status).toBe("fail");
    expect(calls).toHaveLength(4);
  });

  it("a redirect that leaves the new host is an error and is never fetched", async () => {
    const { result, calls } = await classify("/produkt/alpha/", {
      "/produkt/alpha/": answer(301, "https://foreign.example.test/x"),
    });
    expect(result.class).toBe("error");
    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/foreign\.example\.test/);
    expect(calls).toEqual([`${NEW}/produkt/alpha/`]);
  });

  it("a source path that starts with // is still requested on the NEW host (not a network-path reference)", async () => {
    // `//old.example.test/a` resolved against the new origin would be a
    // network-path reference to the SOURCE host. The path travels; the host never does.
    const { result, calls } = await classify("//old.example.test/a", { "//old.example.test/a": page });
    expect(calls).toEqual([`${NEW}//old.example.test/a`]);
    expect(result.targetUrl).toBe(`${NEW}//old.example.test/a`);
    expect(result).toMatchObject({ class: "same", status: "pass" });
  });

  it("a redirect to the new host on http (a downgrade) or another port leaves its origin: an error, never fetched", async () => {
    for (const location of ["http://new.example.test/produkt/alpha/", "https://new.example.test:8443/produkt/alpha/"]) {
      const { result, calls } = await classify("/produkt/alpha/", { "/produkt/alpha/": answer(301, location) });
      expect(result, location).toMatchObject({ class: "error", status: "fail" });
      expect(calls, location).toEqual([`${NEW}/produkt/alpha/`]);
    }
  });

  it("a frozen URL, target origin or newPath that is not an http(s) URL is an error row, never a throw", async () => {
    const host = newHost({ "/a": page });
    const cases: [UrlParityEntry, string, RegExp][] = [
      [{ oldUrl: "not a url" }, NEW, /frozen URL/],
      [{ oldUrl: `${OLD}/a` }, "not an origin", /target origin/],
      [{ oldUrl: `${OLD}/a` }, "data:text/plain,x", /target origin/],
      [{ oldUrl: `${OLD}/a`, expect: "301", newPath: "http://[" }, NEW, /newPath/],
    ];
    for (const [entry, targetOrigin, why] of cases) {
      const result = await classifyUrl(entry, { targetOrigin, fetch: host.fetch });
      expect(result, `${entry.oldUrl} on ${targetOrigin}`).toMatchObject({
        oldUrl: entry.oldUrl,
        class: "error",
        status: "fail",
        http: 0,
        hops: [],
        detail: expect.stringMatching(why),
      });
    }
    expect(host.calls).toEqual([]);
  });

  it("410 = gone; a row that expects gone passes on 404 or 410 and fails on 200", async () => {
    expect((await classify("/old/", { "/old/": answer(410) }, { expect: "gone" })).result).toMatchObject({
      class: "gone",
      status: "pass",
    });
    expect((await classify("/old/", {}, { expect: "gone" })).result.status).toBe("pass");
    expect((await classify("/old/", { "/old/": page }, { expect: "gone" })).result.status).toBe("fail");
  });

  it("expect=301 with a newPath fails when the redirect lands somewhere else", async () => {
    const routes = { "/produkt/alpha/": answer(301, "/da/produkter/beta"), "/da/produkter/beta": page };
    const { result } = await classify("/produkt/alpha/", routes, { expect: "301", newPath: "/da/produkter/alpha" });
    expect(result.class).toBe("redirect");
    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/\/da\/produkter\/alpha/);
  });

  it("expect=301 through a temporary 307 is a warn, not a pass", async () => {
    const routes = { "/produkt/alpha/": answer(307, "/da/produkter/alpha"), "/da/produkter/alpha": page };
    expect((await classify("/produkt/alpha/", routes, { expect: "301" })).result.status).toBe("warn");
  });

  it("an answered non-2xx that is not a redirect or 404/410 is an error (fail)", async () => {
    const { result } = await classify("/produkt/alpha/", { "/produkt/alpha/": answer(403) });
    expect(result).toMatchObject({ class: "error", status: "fail", http: 403 });
  });

  it("a fetch-layer error (empty 2xx body) is an error, not a page", async () => {
    const empty: Route = (url) => ({ outcome: "error", url, status: 200, reason: "empty body" });
    const { result } = await classify("/produkt/alpha/", { "/produkt/alpha/": empty });
    expect(result).toMatchObject({ class: "error", status: "fail", detail: "empty body" });
  });
});

describe("url.parity — variant-query URLs are their own entries", () => {
  const VARIANT = "/produkt/alpha/?attribute_pa_farve=sort&attribute_pa_hoejde=180";

  it("recognises Woo variation queries (global pa_ and local attributes)", () => {
    expect(isVariantQuery(new URL(OLD + VARIANT))).toBe(true);
    expect(isVariantQuery(new URL(`${OLD}/produkt/alpha/?attribute_size=l`))).toBe(true);
    expect(isVariantQuery(new URL(`${OLD}/produkt/alpha/`))).toBe(false);
    expect(isVariantQuery(new URL(`${OLD}/?s=alpha`))).toBe(false);
  });

  it("each variant is requested with its own query and judged on its own", async () => {
    const host = newHost({ "/produkt/alpha/": page, [VARIANT]: answer(404) });
    const ctx = { targetOrigin: NEW, fetch: host.fetch };
    const base = await classifyUrl({ oldUrl: `${OLD}/produkt/alpha/` }, ctx);
    const variant = await classifyUrl({ oldUrl: OLD + VARIANT }, ctx);
    expect(host.calls).toEqual([`${NEW}/produkt/alpha/`, NEW + VARIANT]);
    expect(base).toMatchObject({ class: "same", variant: false });
    expect(variant).toMatchObject({ class: "missing", status: "fail", variant: true });
  });

  it("a redirect that drops the variant query is a redirect, not same-modulo-slash", async () => {
    const { result } = await classify(VARIANT, { [VARIANT]: answer(301, "/produkt/alpha/"), "/produkt/alpha/": page });
    expect(result.class).toBe("redirect");
    expect(result.status).toBe("fail");
    // Even when the redirect ALSO only trims the slash, losing the query is not a slash difference.
    const trimmed = await classify(VARIANT, { [VARIANT]: answer(308, "/produkt/alpha"), "/produkt/alpha": page });
    expect(trimmed.result.class).toBe("redirect");
    // …while keeping the query and trimming the slash is.
    const kept = "/produkt/alpha?attribute_pa_farve=sort&attribute_pa_hoejde=180";
    const ok = await classify(VARIANT, { [VARIANT]: answer(308, kept), [kept]: page });
    expect(ok.result).toMatchObject({ class: "same-modulo-slash", status: "warn", variant: true });
  });
});

describe("summarizeUrlParity", () => {
  const row = (status: UrlParityResult["status"], i = 0) =>
    ({ oldUrl: `${OLD}/p${i}/`, status, class: status === "pass" ? "same" : "missing" }) as UrlParityResult;

  it("no rows is skip, never a pass", () => {
    expect(summarizeUrlParity([]).status).toBe("skip");
  });

  it("any fail fails; else inconclusive; else warn; else pass", () => {
    expect(summarizeUrlParity([row("pass"), row("inconclusive"), row("fail")]).status).toBe("fail");
    expect(summarizeUrlParity([row("pass"), row("warn"), row("inconclusive")]).status).toBe("inconclusive");
    expect(summarizeUrlParity([row("pass"), row("warn")]).status).toBe("warn");
    expect(summarizeUrlParity([row("pass")]).status).toBe("pass");
  });

  it("counts every row and lists at most 20 non-pass rows, fails first", () => {
    const rows = [row("inconclusive", 99), ...Array.from({ length: 25 }, (_, i) => row("fail", i)), row("pass")];
    const s = summarizeUrlParity(rows);
    expect(s.processed).toBe(27);
    expect(s.counts).toEqual({ pass: 1, warn: 0, fail: 25, inconclusive: 1 });
    expect(s.classes).toEqual({ missing: 26, same: 1 });
    expect(s.firstErrors).toHaveLength(20);
    expect(s.firstErrors.every((r) => r.status === "fail")).toBe(true);
  });
});
