import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIGD-1b — `migrationGet` is status-first: a 3xx/4xx is an answer with no
 * page body, 000/5xx/429 is inconclusive, an empty 2xx is an error, and a host
 * outside the allowlist (or resolving privately) is refused without a request.
 * DNS and fetch are both faked — no network.
 */

const dns = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({ ...dns, default: dns }));

import { migrationFetcher, migrationGet } from "@/lib/migration/fetch";
import { probeNotFound } from "@/lib/migration/checks/page";
import { classifyRedirect } from "@/lib/migration/checks/redirect";
import { classifyUrl } from "@/lib/migration/checks/url";

const fetchMock = vi.fn<typeof fetch>();
const OPTS = { allowHosts: ["new.example.test"] };
const URL_A = "https://new.example.test/produkt/alpha/";

beforeEach(() => {
  dns.lookup.mockImplementation(async (host: string) =>
    host === "private.example.test" ? [{ address: "10.0.0.7", family: 4 }] : [{ address: "203.0.113.10", family: 4 }],
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("migrationGet", () => {
  it("sends one GET with redirect: manual and the migration User-Agent", async () => {
    fetchMock.mockResolvedValue(new Response("<h1>Alpha</h1>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }));
    const res = await migrationGet(URL_A, OPTS);
    expect(res).toEqual({
      outcome: "answer",
      url: URL_A,
      status: 200,
      location: null,
      contentType: "text/html",
      body: "<h1>Alpha</h1>",
      truncated: false,
      xRobotsTag: null,
    });
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("manual");
    expect((init.headers as Record<string, string>)["user-agent"]).toMatch(/^CartwrightMigration\/1\.0 \(\+https?:\/\//);
  });

  it("a 3xx is an answer with its Location and NO page body, even when it carries an HTML stub", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>301 Moved Permanently</html>", { status: 301, headers: { location: "/da/produkter/alpha" } }),
    );
    expect(await migrationGet(URL_A, OPTS)).toMatchObject({
      outcome: "answer",
      status: 301,
      location: "/da/produkter/alpha",
      body: "",
    });
  });

  it("a 404 is an answer, not inconclusive", async () => {
    fetchMock.mockResolvedValue(new Response("Not found", { status: 404 }));
    expect(await migrationGet(URL_A, OPTS)).toMatchObject({ outcome: "answer", status: 404, body: "" });
  });

  it("a 404's body is read only for the soft-404 probe that asks for it (MIGD-4a); a 403 never", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<title>Not found</title>", { status: 404 }));
    expect(await migrationGet(URL_A, { ...OPTS, bodyOn404: true })).toMatchObject({ outcome: "answer", status: 404, body: "<title>Not found</title>" });
    fetchMock.mockResolvedValueOnce(new Response("<title>Forbidden</title>", { status: 403 }));
    expect(await migrationGet(URL_A, { ...OPTS, bodyOn404: true })).toMatchObject({ outcome: "answer", status: 403, body: "" });
  });

  // R2: a site whose 404 page is empty still has one — the soft-404 probe reads it as "|", not as unreadable.
  it("an empty 404 asked for with bodyOn404 is an answer; an empty 200 stays an error", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));
    expect(await migrationGet(URL_A, { ...OPTS, bodyOn404: true })).toMatchObject({ outcome: "answer", status: 404, body: "" });
    fetchMock.mockResolvedValueOnce(new Response(" ", { status: 200 }));
    expect(await migrationGet(URL_A, { ...OPTS, bodyOn404: true })).toMatchObject({ outcome: "error", status: 200 });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await probeNotFound(migrationFetcher(OPTS), "https://new.example.test", "t1")).toBe("|");
  });

  it("hands over the X-Robots-Tag header, a page's or a redirect's (MIGD-4a)", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<h1>Alpha</h1>", { status: 200, headers: { "x-robots-tag": "noindex, nofollow" } }));
    expect(await migrationGet(URL_A, OPTS)).toMatchObject({ outcome: "answer", xRobotsTag: "noindex, nofollow" });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: "/b", "x-robots-tag": "noindex" } }));
    expect(await migrationGet(URL_A, OPTS)).toMatchObject({ outcome: "answer", status: 301, xRobotsTag: "noindex" });
  });

  it("5xx, 429 and no response at all (000) are inconclusive", async () => {
    for (const status of [500, 503, 429]) {
      fetchMock.mockResolvedValueOnce(new Response("busy", { status }));
      expect(await migrationGet(URL_A, OPTS), String(status)).toMatchObject({ outcome: "inconclusive", status });
    }
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await migrationGet(URL_A, OPTS)).toMatchObject({ outcome: "inconclusive", status: 0 });
  });

  it("an empty 2xx body is an error, not a page", async () => {
    fetchMock.mockResolvedValue(new Response("  \n", { status: 200 }));
    expect(await migrationGet(URL_A, OPTS)).toMatchObject({ outcome: "error", status: 200, reason: "empty body" });
  });

  it("refuses a host outside the allowlist without sending anything", async () => {
    expect(await migrationGet("https://foreign.example.test/x", OPTS)).toMatchObject({
      outcome: "refused",
      reason: "foreign-host",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an allowed name that resolves to a private address (SSRF guard), and a private literal", async () => {
    const res = await migrationGet("https://private.example.test/x", { allowHosts: ["private.example.test"] });
    expect(res).toMatchObject({ outcome: "refused" });
    expect(await migrationGet("http://169.254.169.254/latest", { allowHosts: ["169.254.169.254"] })).toMatchObject({
      outcome: "refused",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an unresolvable host is inconclusive (not there yet), not refused", async () => {
    dns.lookup.mockRejectedValueOnce(new Error("ENOTFOUND"));
    expect(await migrationGet(URL_A, OPTS)).toMatchObject({ outcome: "inconclusive", status: 0 });
  });

  it("reads at most maxBytes and says it truncated", async () => {
    fetchMock.mockResolvedValue(new Response("x".repeat(5000), { status: 200 }));
    const res = await migrationGet(URL_A, { ...OPTS, maxBytes: 1024 });
    expect(res).toMatchObject({ outcome: "answer", truncated: true });
    expect(res.outcome === "answer" && res.body.length).toBe(1024);
  });
});

describe("a 2xx that is not 200, as the real fetcher hands it to the checks", () => {
  const ORIGIN = "https://new.example.test";
  const ctx = { targetOrigin: ORIGIN, fetch: migrationFetcher(OPTS) };
  const saved = { fromPath: "/old", toPath: "/new", statusCode: 301 };
  /** `/old` redirects to `/new`, and anything else answers `status`. */
  const answering = (status: number, body: string | null) =>
    fetchMock.mockImplementation(async (input) =>
      new URL(String(input)).pathname === "/old" ? new Response(null, { status: 301, headers: { location: "/new" } }) : new Response(body, { status }),
    );

  it.each([201, 202, 203, 206])("HTTP %i with a page in it reaches the rule, and never lands", async (status) => {
    answering(status, "<h1>Alpha</h1>");
    expect(await migrationGet(`${ORIGIN}/new`, OPTS)).toMatchObject({ outcome: "answer", status, body: "<h1>Alpha</h1>" });
    expect(await classifyRedirect(saved, ctx)).toMatchObject({ class: "bad-landing", status: "fail", http: status });
    expect(await classifyUrl({ oldUrl: "https://old.example.test/new" }, ctx)).toMatchObject({ class: "error", status: "fail", http: status, detail: `HTTP ${status}` });
  });

  it("HTTP 204 has no body, so the fetcher makes it an error row, and it never lands either", async () => {
    answering(204, null);
    expect(await classifyRedirect(saved, ctx)).toMatchObject({ class: "error", status: "fail", http: 204, detail: "empty body" });
    expect(await classifyUrl({ oldUrl: "https://old.example.test/new" }, ctx)).toMatchObject({ class: "error", status: "fail", http: 204, detail: "empty body" });
  });
});
