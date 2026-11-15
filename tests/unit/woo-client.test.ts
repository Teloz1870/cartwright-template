import { describe, expect, it, vi } from "vitest";

import {
  WooHttpError,
  WooPartialAnswer,
  createWooClient,
  type WooClientOptions,
  type WooRequestInit,
  type WooTransport,
} from "@/lib/woo/client";
import { stockFact } from "@/lib/woo/decide";
import { WOO_SOURCE } from "@/lib/woo/map-catalog";
import { planWooCatalog, type WooDbState } from "@/lib/woo/plan";
import { STORE_URL, fixtureTransport, type RecordedCall } from "./woo-fixture-shop";

/**
 * W21-live-1 — the read-only WooCommerce client. No network: the transport is
 * injected, and so is the DNS guard (example.test never resolves).
 */

type Answer = { status: number; body?: unknown; headers?: Record<string, string> };

function scripted(answers: Answer[], calls: RecordedCall[] = []): WooTransport {
  return async (raw, init) => {
    calls.push({ url: new URL(raw), init });
    const next = answers.shift();
    if (!next) throw new Error("the test ran out of answers");
    return Response.json(next.body ?? [], { status: next.status, headers: next.headers });
  };
}

function client(transport: WooTransport, extra: Partial<WooClientOptions> = {}) {
  const sleeps: number[] = [];
  const woo = createWooClient({
    storeUrl: STORE_URL,
    siteUrl: "https://cartwright.example.test",
    transport,
    assertHostPublic: async () => {},
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...extra,
  });
  return { woo, sleeps };
}

describe("woo client — retries", () => {
  it("retries a 429, waiting Retry-After first and then backing off, and returns the page", async () => {
    const calls: RecordedCall[] = [];
    const { woo, sleeps } = client(
      scripted(
        [
          { status: 429, headers: { "retry-after": "2" } },
          { status: 429 },
          { status: 200, body: [{ id: 1 }], headers: { "x-wp-total": "1", "x-wp-totalpages": "1" } },
        ],
        calls,
      ),
    );
    const { rows, meta } = await woo.listAll<{ id: number }>("wc/store/v1/products");
    expect(rows).toEqual([{ id: 1 }]);
    expect(meta).toEqual({ complete: true, total: 1, fetched: 1 });
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([2000, 1000]);
  });

  it("gives up after three retries of a 5xx and says which status it got", async () => {
    const calls: RecordedCall[] = [];
    const { woo, sleeps } = client(scripted(Array(4).fill({ status: 503 }), calls));
    await expect(woo.listAll("wc/store/v1/products")).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([500, 1000, 2000]);
  });

  it.each([400, 401, 403, 404])("stops at once on a %i — no retry, no wait", async (status) => {
    const calls: RecordedCall[] = [];
    const { woo, sleeps } = client(scripted([{ status }, { status: 200 }], calls));
    const failure = await woo.listAll("wc/store/v1/products").catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(WooHttpError);
    expect((failure as WooHttpError).status).toBe(status);
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it("does not follow a redirect to an address nobody validated", async () => {
    const calls: RecordedCall[] = [];
    const { woo } = client(
      scripted([{ status: 301, headers: { location: "http://169.254.169.254/" } }], calls),
    );
    await expect(woo.listAll("wc/store/v1/products")).rejects.toMatchObject({ status: 301 });
    expect(calls).toHaveLength(1);
  });
});

describe("woo client — GET only", () => {
  it("sends every request as a bodiless GET with the importer's User-Agent", async () => {
    const calls: RecordedCall[] = [];
    const { woo } = client(fixtureTransport(calls));
    await woo.fetchSnapshot();
    expect(calls.length).toBeGreaterThan(0);
    for (const { init } of calls) {
      expect(init.method).toBe("GET");
      expect(init).not.toHaveProperty("body");
      expect(init.redirect).toBe("manual");
      expect(init.headers["user-agent"]).toBe(
        "cartwright-woo-import/1.0 (+https://cartwright.example.test)",
      );
    }
  });

  it("has no way to name another method, at the type level (checked by tsc, never run)", () => {
    const { woo } = client(fixtureTransport());
    const typeOnly = (signal: AbortSignal): unknown[] => [
      // @ts-expect-error — the one channel to the network admits GET and nothing else
      { method: "POST", headers: {}, redirect: "manual", signal } satisfies WooRequestInit,
      // @ts-expect-error — the client takes no method, init or body
      woo.listAll("wc/store/v1/products", {}, { method: "POST" }),
      // @ts-expect-error — nor does its constructor
      createWooClient({ storeUrl: STORE_URL, siteUrl: STORE_URL, method: "POST" }),
      // @ts-expect-error — and it reads only the public APIs, never the keyed wc/v3
      woo.listAll("wc/v3/products"),
    ];
    expect(typeof typeOnly).toBe("function");
  });
});

describe("woo client — pagination and the snapshot", () => {
  it("walks to X-WP-TotalPages, and a collection is complete only when X-WP-Total says so", async () => {
    const page = (ids: number[], total?: number) => ({
      status: 200,
      body: ids.map((id) => ({ id })),
      headers: total === undefined ? undefined : { "x-wp-total": String(total), "x-wp-totalpages": "2" },
    });
    const calls: RecordedCall[] = [];
    const { woo } = client(scripted([page([1, 2], 3), page([3], 3)], calls));
    const full = await woo.listAll("wc/store/v1/products");
    expect(full.meta).toEqual({ complete: true, total: 3, fetched: 3 });
    expect(calls.map((c) => c.url.searchParams.get("page"))).toEqual(["1", "2"]);
    expect(calls[0].url.searchParams.get("per_page")).toBe("100");

    // No headers: walks to the empty page, and cannot prove the list is whole.
    const bare = client(scripted([page([1, 2]), page([3]), page([])])).woo;
    expect((await bare.listAll("wc/store/v1/products")).meta).toEqual({
      complete: false,
      total: null,
      fetched: 3,
    });

    // An endpoint that ignores `page` answers the same rows again: the walk stops.
    const repeat = client(scripted([page([1, 2]), page([1, 2])])).woo;
    expect((await repeat.listAll("wc/store/v1/products/categories")).rows).toHaveLength(2);
  });

  it("fetches one snapshot: Store API catalogue, every variation, and wp/v2 by include", async () => {
    const calls: RecordedCall[] = [];
    const { woo } = client(fixtureTransport(calls));
    const snap = await woo.fetchSnapshot(new Date("2026-10-24T00:00:00Z"));
    expect(snap.categories).toHaveLength(4);
    expect(snap.products.map((p) => p.id)).toEqual([101, 102, 103]);
    expect(snap.variations.map((v) => v.id)).toEqual([201, 202, 299]);
    expect(snap.wpProducts.map((p) => p.id)).toEqual([101, 102, 103]);
    expect(snap.meta.products).toEqual({ complete: true, total: 3, fetched: 3 });
    const wp = calls.find((c) => c.url.pathname === "/wp-json/wp/v2/product");
    expect(wp?.url.searchParams.get("include")).toBe("101,102,103");
    expect(wp?.url.searchParams.get("per_page")).toBe("100");
  });
});

describe("woo client — wp/v2 extras are optional (R1)", () => {
  it.each([401, 403, 404])("a wp/v2 product route answering %i leaves the snapshot whole, flagged incomplete", async (status) => {
    const { woo } = client(fixtureTransport([], { wpStatus: status }));
    const snap = await woo.fetchSnapshot();
    expect(snap.products).toHaveLength(3);
    expect(snap.wpProducts).toEqual([]);
    expect(snap.meta.wpProducts).toEqual({ complete: false, total: 3, fetched: 0 });
  });

  it("still stops when wp/v2 keeps failing with a 5xx", async () => {
    const { woo } = client(fixtureTransport([], { wpStatus: 503 }));
    await expect(woo.fetchSnapshot()).rejects.toMatchObject({ status: 503 });
  });

  it("marks wp/v2 complete when it answered for every product", async () => {
    const { woo } = client(fixtureTransport());
    expect((await woo.fetchSnapshot()).meta.wpProducts).toEqual({ complete: true, total: 3, fetched: 3 });
  });
});

describe("woo client — R5: empty categories, Retry-After dates", () => {
  const EMPTY = { id: 13, name: "Gulvlamper", slug: "gulvlamper", parent: 10, count: 0, permalink: "https://shop.example.test/lamper/gulvlamper/" };

  it("asks for empty categories too, so a category with no products is in the snapshot", async () => {
    const calls: RecordedCall[] = [];
    const { woo } = client(fixtureTransport(calls, { extraCategories: [EMPTY] }));
    const snap = await woo.fetchSnapshot();
    expect(snap.categories.map((c) => c.id)).toContain(13);
    const route = calls.find((c) => c.url.pathname.endsWith("/products/categories"));
    expect(route?.url.searchParams.get("hide_empty")).toBe("false");
  });

  it("a category imported earlier that has since become empty is not missing in the source", async () => {
    const { woo } = client(fixtureTransport([], { extraCategories: [EMPTY] }));
    const snap = await woo.fetchSnapshot();
    const db: WooDbState = {
      categories: [{ id: "c-13", source: WOO_SOURCE, externalId: "13", slug: "gulvlamper", permalink: "/lamper/gulvlamper/" }],
      products: [],
    };
    const plan = await planWooCatalog(snap, db, { currency: "DKK", pricesIncludeVat: true, sourcePricesIncludeVat: true });
    expect(plan.missingInSource).toEqual([]);
  });

  it("reads Retry-After as an HTTP-date too: a wait from now, never negative, capped at 30 s", async () => {
    const at = (ms: number) => new Date(Date.now() + ms).toUTCString();
    const { woo, sleeps } = client(
      scripted([
        { status: 429, headers: { "retry-after": at(5_000) } },
        { status: 429, headers: { "retry-after": at(-60_000) } },
        { status: 429, headers: { "retry-after": at(3_600_000) } },
        { status: 200, body: [{ id: 1 }], headers: { "x-wp-total": "1", "x-wp-totalpages": "1" } },
      ]),
    );
    await woo.listAll("wc/store/v1/products");
    expect(sleeps[0]).toBeGreaterThan(3_000);
    expect(sleeps[0]).toBeLessThanOrEqual(5_000);
    expect(sleeps.slice(1)).toEqual([0, 30_000]);
  });
});

describe("woo client — SSRF guard", () => {
  it("refuses a private store address before any request", () => {
    const transport = vi.fn<WooTransport>();
    expect(() =>
      createWooClient({ storeUrl: "http://127.0.0.1:8080/", siteUrl: STORE_URL, transport }),
    ).toThrow(/private|loopback/i);
    expect(transport).not.toHaveBeenCalled();
  });

  it("checks the resolved host before the first request, and a refusal sends nothing", async () => {
    const transport = vi.fn<WooTransport>();
    const { woo } = client(transport, {
      assertHostPublic: async (host) => {
        throw new Error(`refused ${host}`);
      },
    });
    await expect(woo.listAll("wc/store/v1/products")).rejects.toThrow("refused shop.example.test");
    expect(transport).not.toHaveBeenCalled();
  });
});

describe("woo client — W21-SAFE-INT: counts it can hold, and a wp/v2 failure that ends the read", () => {
  it("reads an X-WP-Total or X-WP-TotalPages past 2^53 as unknown, not as a rounded count", async () => {
    const huge = "9007199254740993"; // 2^53 + 1: Number() rounds it to 2^53
    const calls: RecordedCall[] = [];
    const { woo } = client(
      scripted([{ status: 200, body: [{ id: 1 }], headers: { "x-wp-total": huge, "x-wp-totalpages": huge } }, { status: 200, body: [] }], calls),
    );
    expect((await woo.listAll("wc/store/v1/products")).meta).toEqual({ complete: false, total: null, fetched: 1 });
    expect(calls).toHaveLength(2); // walked to the empty page, as with no headers

    const edge = (total: string) => client(scripted([{ status: 200, body: [{ id: 1 }], headers: { "x-wp-total": total, "x-wp-totalpages": "1" } }])).woo;
    expect((await edge("9007199254740992").listAll("wc/store/v1/products")).meta.total).toBeNull(); // 2^53 itself
    expect((await edge("9007199254740991").listAll("wc/store/v1/products")).meta.total).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("a redirect on the wp/v2 product route stops the read as a redirect, not as an incomplete snapshot", async () => {
    const { woo } = client(fixtureTransport([], { wpStatus: 301 }));
    const failure = await woo.fetchSnapshot().catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(WooHttpError);
    expect(failure).toMatchObject({ status: 301, url: expect.stringContaining("/wp-json/wp/v2/product") });
  });

  it("once one wp/v2 request fails, its siblings stop retrying in the background", async () => {
    const products = Array.from({ length: 400 }, (_, n) => ({ id: n + 1 }));
    const wp: string[] = [];
    const transport: WooTransport = async (raw) => {
      const url = new URL(raw);
      if (url.pathname.endsWith("/wp/v2/product")) {
        const include = url.searchParams.get("include") ?? "";
        wp.push(include.split(",")[0]);
        // The first hundred redirect (a failure that ends the read); the other three are busy and would be retried.
        return include.startsWith("1,") ? new Response(null, { status: 302 }) : new Response("busy", { status: 503 });
      }
      const first = url.searchParams.get("page") === "1";
      const isProducts = url.pathname.endsWith("/wc/store/v1/products") && !url.searchParams.get("type");
      return Response.json(first && isProducts ? products : []);
    };
    const { woo } = client(transport, { sleep: () => new Promise<void>((r) => setTimeout(r, 0)) });
    await expect(woo.fetchSnapshot()).rejects.toMatchObject({ status: 302 });
    await new Promise<void>((r) => setTimeout(r, 50)); // room for any retry still running
    expect(wp.sort()).toEqual(["1", "101", "201", "301"]); // each request once: no retry after the failure
  });
});

describe("woo client — W21-STOREPATH: a WordPress in a subdirectory", () => {
  const base = new URL(STORE_URL).origin;

  it("reads every route under the shop's path, with or without its trailing slash", async () => {
    for (const storeUrl of [`${base}/shop`, `${base}/shop/`]) {
      const calls: RecordedCall[] = [];
      const { woo } = client(scripted([{ status: 200, body: [] }, { status: 200, body: [] }], calls), { storeUrl });
      await woo.listAll("wc/store/v1/products");
      await woo.listAll("wp/v2/product");
      expect(calls.map((c) => c.url.pathname), storeUrl).toEqual(["/shop/wp-json/wc/store/v1/products", "/shop/wp-json/wp/v2/product"]);
    }
  });

  it("a root install is read at /wp-json/, as before", async () => {
    const calls: RecordedCall[] = [];
    const { woo } = client(scripted([{ status: 200, body: [] }], calls), { storeUrl: base });
    await woo.listAll("wc/store/v1/products");
    expect(calls[0].url.pathname).toBe("/wp-json/wc/store/v1/products");
  });

  it("refuses an address with a query or fragment before any request", () => {
    const transport = vi.fn<WooTransport>();
    for (const storeUrl of [`${base}/shop/?lang=da`, `${base}/shop#x`]) {
      expect(() => client(transport, { storeUrl }), storeUrl).toThrow(/query or fragment/);
    }
    expect(transport).not.toHaveBeenCalled();
  });
});

const KEY = { user: "ck_invented_key", pass: "cs_invented_secret" };
const stockRow = (id: number, quantity: number | null = 5) => ({ id, manage_stock: quantity !== null, stock_quantity: quantity, stock_status: "instock" });
/** Waits as a request in flight waits, until the read's stop signal ends it. Says so in `aborted`. */
const untilStopped = (init: WooRequestInit, aborted: string[], name: string) =>
  new Promise<Response>((_, reject) => {
    init.signal.addEventListener("abort", () => {
      aborted.push(name);
      reject(new Error("aborted"));
    });
  });
const count = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("woo client — W21-live-2a-2a: the key, in the constructor", () => {
  const { user: USER, pass: SECRET } = KEY;
  const plainHttp = "http://shop.example.test/";

  it.each([
    ["no key half", { user: "", pass: SECRET }],
    ["no secret half", { user: USER, pass: "" }],
    ["a blank key half", { user: "  ", pass: SECRET }],
    ["a blank secret half", { user: USER, pass: " \t" }],
    ["two empty halves", { user: "", pass: "" }],
  ])("client › empty key halves throw at construction: %s", (_, auth) => {
    const transport = vi.fn<WooTransport>();
    const made = () => client(transport, { auth });
    expect(made).toThrow(/both halves/);
    expect(made).not.toThrow(new RegExp(`${SECRET}|${USER}`));
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([plainHttp, "HTTP://shop.example.test/shop"])("client › keyed http store fails closed in dry run: %s is refused before any request, and its message names no half", (storeUrl) => {
    const transport = vi.fn<WooTransport>();
    const failure = (() => {
      try {
        return client(transport, { auth: KEY, storeUrl });
      } catch (err) {
        return err;
      }
    })();
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toMatch(/https only/);
    expect(String(failure)).not.toMatch(new RegExp(`${SECRET}|${USER}`));
    expect(transport).not.toHaveBeenCalled();
  });

  it("the same address with no key is built, reads the public APIs, and stockOf refuses: https binds the key, not the public read", async () => {
    const calls: RecordedCall[] = [];
    const { woo } = client(scripted([{ status: 200, body: [{ id: 1 }], headers: { "x-wp-total": "1", "x-wp-totalpages": "1" } }], calls), { storeUrl: plainHttp });
    expect((await woo.listAll("wc/store/v1/products")).rows).toEqual([{ id: 1 }]);
    await expect(woo.stockOf([101])).rejects.toThrow(/with a key/);
    expect(calls).toHaveLength(1);
  });

  it.each([`https://${USER}:${SECRET}@shop.example.test/`, `https://${USER}@shop.example.test/`, `https://:${SECRET}@shop.example.test/`])("an address carrying a key is refused before any request, key or no key, and its message does not repeat it: %s", (storeUrl) => {
    const transport = vi.fn<WooTransport>();
    for (const extra of [{ storeUrl }, { storeUrl, auth: KEY }]) {
      const made = () => client(transport, extra);
      expect(made).toThrow(/never in a URL/);
      expect(made).not.toThrow(new RegExp(`${SECRET}|${USER}`));
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([[[]], [[101]]])("assertKeyed: with no key, stockOf(%j) is refused before any request, and an empty list is no way around it", async (ids: number[]) => {
    const transport = vi.fn<WooTransport>();
    const assertHostPublic = vi.fn(async () => {});
    const { woo } = client(transport, { assertHostPublic });
    await expect(woo.stockOf(ids)).rejects.toThrow(/with a key/);
    expect(transport).not.toHaveBeenCalled();
    expect(assertHostPublic).not.toHaveBeenCalled();
  });

  it("with a key, an empty list sends nothing and answers nothing", async () => {
    const transport = vi.fn<WooTransport>();
    const stock = await client(transport, { auth: KEY }).woo.stockOf([]);
    expect([...stock]).toEqual([]);
    expect(transport).not.toHaveBeenCalled();
  });

  it("the key leaves as one Basic header on wc/v3: not in the URL, and on no public route", async () => {
    const calls: RecordedCall[] = [];
    const answers = fixtureTransport(calls);
    const transport: WooTransport = (raw, init) => {
      if (!raw.includes("/wc/v3/")) return answers(raw, init);
      calls.push({ url: new URL(raw), init });
      return Promise.resolve(Response.json([stockRow(101)]));
    };
    const { woo } = client(transport, { auth: KEY });
    await woo.fetchSnapshot();
    await woo.stockOf([101]);
    const keyed = calls.filter((c) => c.url.pathname.includes("/wc/v3/"));
    const open = calls.filter((c) => !c.url.pathname.includes("/wc/v3/"));
    expect(keyed).toHaveLength(1);
    expect(open.length).toBeGreaterThan(3);
    for (const { init } of open) expect(init.headers).not.toHaveProperty("authorization");
    const [{ url, init }] = keyed;
    expect(url.pathname).toBe("/wp-json/wc/v3/products");
    expect(Object.fromEntries(url.searchParams)).toEqual({ include: "101", per_page: "100", _fields: "id,manage_stock,stock_quantity,stock_status" });
    const sent = init.headers.authorization ?? "";
    expect(sent.split(" ")[0]).toBe("Basic");
    expect(Buffer.from(sent.split(" ")[1], "base64").toString()).toBe(`${USER}:${SECRET}`);
    expect(init).toMatchObject({ method: "GET", redirect: "manual", headers: { accept: "application/json", "user-agent": "cartwright-woo-import/1.0 (+https://cartwright.example.test)" } });
    expect(init).not.toHaveProperty("body");
    for (const { url: seen } of calls) {
      expect(seen.href).not.toContain(SECRET);
      expect(seen.href).not.toContain(USER);
      expect(seen.username + seen.password).toBe("");
    }
  });

  it("the key is read once, when the client is made: a half blanked afterwards changes nothing", async () => {
    const calls: RecordedCall[] = [];
    const auth = { ...KEY };
    const { woo } = client(scripted([{ status: 200, body: [stockRow(101)] }], calls), { auth });
    auth.pass = "";
    await woo.stockOf([101]);
    expect(Buffer.from((calls[0].init.headers.authorization ?? "").replace("Basic ", ""), "base64").toString()).toBe(`${USER}:${SECRET}`);
  });

  it("no failure carries the key, and nothing is logged", async () => {
    const logged = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level));
    const header = `Basic ${Buffer.from(`${USER}:${SECRET}`).toString("base64")}`;
    const failing: WooTransport[] = [
      scripted([{ status: 401 }]),
      scripted(Array(4).fill({ status: 503 })),
      scripted([{ status: 301, headers: { location: "https://elsewhere.example.test/" } }]),
      scripted([{ status: 200, body: [] }]),
      async () => {
        throw new Error("the network went away");
      },
    ];
    for (const transport of failing) {
      const failure = (await client(transport, { auth: KEY }).woo.stockOf([101]).catch((err: unknown) => err)) as Error;
      expect(failure).toBeInstanceOf(Error);
      const shown = `${String(failure)} ${failure.stack ?? ""} ${JSON.stringify(failure)}`;
      for (const part of [SECRET, USER, header]) expect(shown).not.toContain(part);
    }
    for (const spy of logged) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});

describe("woo client — W21-live-2a-2a: stockOf answers exact facts per id", () => {
  it("returns the facts by Woo id as decide() reads them: keyed by string, these four fields, and only the ids asked for", async () => {
    const calls: RecordedCall[] = [];
    const untracked = { id: 102, manage_stock: false, stock_quantity: null, stock_status: "instock" };
    const { woo } = client(
      scripted([{ status: 200, body: [{ ...stockRow(101, 7), name: "A lamp", meta_data: [{ key: "x" }] }, untracked, stockRow(999, 1)] }], calls),
      { auth: KEY },
    );
    const stock = await woo.stockOf([101, 102]);
    expect([...stock]).toEqual([
      ["101", { id: 101, manage_stock: true, stock_quantity: 7, stock_status: "instock" }],
      ["102", untracked],
    ]);
    expect(stockFact(stock.get("101"))).toBe("exact");
    expect(stockFact(stock.get("102"))).toBe("stockUntracked");
  });

  it("asks for at most 100 ids a request, four requests at a time, each id once, and answers for all of them", async () => {
    const calls: RecordedCall[] = [];
    let flying = 0;
    let most = 0;
    const transport: WooTransport = async (raw, init) => {
      const url = new URL(raw);
      calls.push({ url, init });
      most = Math.max(most, ++flying);
      await new Promise((r) => setTimeout(r, 1));
      flying--;
      return Response.json((url.searchParams.get("include") ?? "").split(",").map((id) => stockRow(Number(id))));
    };
    const ids = count(950);
    const stock = await client(transport, { auth: KEY }).woo.stockOf(ids);
    expect(stock.size).toBe(950);
    expect(most).toBe(4);
    const asked = calls.map((c) => (c.url.searchParams.get("include") ?? "").split(",").map(Number));
    expect(asked.map((a) => a.length)).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 100, 50]);
    expect(asked.flat().sort((a, b) => a - b)).toEqual(ids);
    for (const c of calls) expect(c.url.searchParams.get("per_page")).toBe("100");
  });

  it.each<[string, unknown, number[]]>([
    ["a requested id it does not answer for", [stockRow(101)], [102, 103]],
    ["an empty list", [], [101, 102, 103]],
    ["two rows for one id", [stockRow(101, 7), stockRow(101, 0), stockRow(102), stockRow(103)], [101]],
    ["an id as a string, which no id here equals", [{ ...stockRow(101), id: "101" }, stockRow(102), stockRow(103)], [101]],
    ["a null where a row should be", [null, stockRow(102), stockRow(103)], [101]],
    ["an object, not a list", { code: "woocommerce_rest_cannot_view" }, [101, 102, 103]],
  ])("%s is a failure naming the ids, with no retry, not a silent absence", async (_, body, ids) => {
    const calls: RecordedCall[] = [];
    const { woo, sleeps } = client(scripted([{ status: 200, body }], calls), { auth: KEY });
    const failure = await woo.stockOf([101, 102, 103]).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(WooPartialAnswer);
    expect(failure).toMatchObject({ name: "WooPartialAnswer", path: "wc/v3/products", ids });
    expect(String(failure)).toContain(ids.join(", "));
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it("a long list of missing ids is counted and carried whole, and its message names the first five", async () => {
    const failure = await client(scripted([{ status: 200, body: [] }]), { auth: KEY }).woo.stockOf(count(7)).catch((err: unknown) => err);
    expect(failure).toMatchObject({ ids: count(7) });
    expect(String(failure)).toContain("for 7 of the ids it was asked for, first 1, 2, 3, 4, 5.");
  });
});

describe("woo client — W21-live-2a-2a: one failure stops the read", () => {
  it("client › stockOf failure aborts siblings: requests in flight end, none later goes out, and the read reports the failure", async () => {
    const calls: RecordedCall[] = [];
    const aborted: string[] = [];
    let started = 0;
    const transport: WooTransport = async (raw, init) => {
      const url = new URL(raw);
      calls.push({ url, init });
      started++;
      const first = url.searchParams.get("include")?.split(",")[0] ?? "";
      if (first !== "1") return untilStopped(init, aborted, first);
      while (started < 4) await new Promise((r) => setTimeout(r, 0)); // the other three are in flight
      return new Response(null, { status: 403 });
    };
    const { woo, sleeps } = client(transport, { auth: KEY });
    const failure = await woo.stockOf(count(950)).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(WooHttpError);
    expect(failure).toMatchObject({ status: 403 });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(aborted.sort()).toEqual(["101", "201", "301"]);
    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([]);
  });

  it("siblings waiting to retry never do: each request goes out once", async () => {
    const asked: string[] = [];
    const transport: WooTransport = async (raw) => {
      const first = new URL(raw).searchParams.get("include")?.split(",")[0] ?? "";
      asked.push(first);
      return first === "1" ? new Response(null, { status: 401 }) : new Response("busy", { status: 503 });
    };
    const { woo } = client(transport, { auth: KEY, sleep: () => new Promise<void>((r) => setTimeout(r, 0)) });
    await expect(woo.stockOf(count(400))).rejects.toMatchObject({ status: 401 });
    await new Promise<void>((r) => setTimeout(r, 50)); // room for any retry still running
    expect(asked.sort()).toEqual(["1", "101", "201", "301"]);
  });

  it("an answer missing an id stops its siblings too: it is a failure like any other", async () => {
    const calls: RecordedCall[] = [];
    const aborted: string[] = [];
    let started = 0;
    const transport: WooTransport = async (raw, init) => {
      const url = new URL(raw);
      calls.push({ url, init });
      started++;
      const first = url.searchParams.get("include")?.split(",")[0] ?? "";
      if (first !== "1") return untilStopped(init, aborted, first);
      while (started < 4) await new Promise((r) => setTimeout(r, 0));
      return Response.json([]);
    };
    const failure = await client(transport, { auth: KEY }).woo.stockOf(count(950)).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(WooPartialAnswer);
    expect(failure).toMatchObject({ ids: count(100) });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(aborted.sort()).toEqual(["101", "201", "301"]);
    expect(calls).toHaveLength(4);
  });

  it("the stop belongs to one read: after a failed read, the client reads again", async () => {
    const { woo } = client(scripted([{ status: 401 }, { status: 200, body: [stockRow(101)] }, { status: 200, body: [{ id: 1 }], headers: { "x-wp-total": "1", "x-wp-totalpages": "1" } }]), { auth: KEY });
    await expect(woo.stockOf([101])).rejects.toMatchObject({ status: 401 });
    expect((await woo.stockOf([101])).get("101")).toEqual(stockRow(101));
    expect((await woo.listAll("wc/store/v1/products")).rows).toEqual([{ id: 1 }]);
  });

  it("a failure in a later batch still ends the read: what earlier batches read is not handed back", async () => {
    const asked: string[] = [];
    const transport: WooTransport = async (raw) => {
      const ids = new URL(raw).searchParams.get("include")?.split(",") ?? [];
      asked.push(ids[0]);
      return ids[0] === "401" ? new Response(null, { status: 404 }) : Response.json(ids.map((id) => stockRow(Number(id))));
    };
    await expect(client(transport, { auth: KEY }).woo.stockOf(count(900))).rejects.toMatchObject({ status: 404 });
    expect(asked.sort((a, b) => Number(a) - Number(b))).toEqual(["1", "101", "201", "301", "401", "501", "601", "701"]);
  });

  it("the wp/v2 extras keep their rules on the same path: an answer that is not a list adds nothing, and a 429 that never clears stops the read", async () => {
    const notAList = fixtureTransport();
    const transport: WooTransport = (raw, init) => (raw.includes("/wp/v2/product") ? Promise.resolve(Response.json({ not: "a list" })) : notAList(raw, init));
    const snap = await client(transport).woo.fetchSnapshot();
    expect(snap.wpProducts).toEqual([]);
    expect(snap.meta.wpProducts).toEqual({ complete: false, total: 3, fetched: 0 });

    await expect(client(fixtureTransport([], { wpStatus: 429 })).woo.fetchSnapshot()).rejects.toMatchObject({ status: 429 });
  });
});

describe("woo client — W21-live-2a-2a: the wp/v2 extras ask and answer as #699 left them, now through byIds", () => {
  const wpRow = (id: number) => ({ id, status: "publish" });
  /** A shop of `n` products whose wp/v2 product route answers as `wp` says, given the ids of one request. */
  const shopOf = (n: number, wp: (ids: number[]) => Response | Promise<Response>): WooTransport => async (raw) => {
    const url = new URL(raw);
    if (url.pathname.endsWith("/wp/v2/product")) return wp((url.searchParams.get("include") ?? "").split(",").map(Number));
    const isProducts = url.pathname.endsWith("/wc/store/v1/products") && !url.searchParams.get("type");
    return Response.json(url.searchParams.get("page") === "1" && isProducts ? count(n).map((id) => ({ id })) : []);
  };

  it("asks for the three fields it keeps, by id, and for nothing else: the fixture ignores `_fields`, a real shop does not", async () => {
    const calls: RecordedCall[] = [];
    await client(fixtureTransport(calls)).woo.fetchSnapshot();
    const wp = calls.filter((c) => c.url.pathname === "/wp-json/wp/v2/product");
    expect(wp.map((c) => Object.fromEntries(c.url.searchParams))).toEqual([{ include: "101,102,103", per_page: "100", _fields: "id,status,yoast_head_json" }]);
  });

  it.each<[string, (ids: number[]) => number[], number[]]>([
    ["some of the products", (ids) => ids.slice(0, 2), [1, 2]],
    ["none of them", () => [], []],
  ])("an answer for %s is kept and flagged incomplete, with no retry: a product wp/v2 will not list is no failure here, as it is for stock", async (_, answered, ids) => {
    let requests = 0;
    const { woo, sleeps } = client(
      shopOf(3, (asked) => {
        requests++;
        return Response.json(answered(asked).map(wpRow));
      }),
    );
    const snap = await woo.fetchSnapshot();
    expect(snap.wpProducts).toEqual(ids.map(wpRow));
    expect(snap.meta.wpProducts).toEqual({ complete: false, total: 3, fetched: ids.length });
    expect(requests).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it("a row nobody asked for is kept and counted, as #699 kept it, where stock drops it", async () => {
    const snap = await client(shopOf(3, () => Response.json([wpRow(999), wpRow(1)]))).woo.fetchSnapshot();
    expect(snap.wpProducts).toEqual([wpRow(999), wpRow(1)]);
    expect(snap.meta.wpProducts).toEqual({ complete: false, total: 3, fetched: 2 });
  });

  it("a 4xx skips only its own request: the rest of its batch and later batches still answer, and the rows stay in the order asked whichever answers first", async () => {
    const asked: number[] = [];
    const transport = shopOf(450, async (ids) => {
      asked.push(ids[0]);
      if (ids[0] === 101) return new Response(null, { status: 403 });
      await new Promise((r) => setTimeout(r, ids[0] === 1 ? 5 : 0)); // the first request answers last
      return Response.json(ids.map(wpRow));
    });
    const snap = await client(transport).woo.fetchSnapshot();
    expect(asked.sort((a, b) => a - b)).toEqual([1, 101, 201, 301, 401]);
    expect(snap.wpProducts.map((p) => p.id)).toEqual(count(450).filter((id) => id <= 100 || id > 200));
    expect(snap.meta.wpProducts).toEqual({ complete: false, total: 450, fetched: 350 });
  });

  it.each([400, 499])("a %i is skipped like the rest of 4xx", async (status) => {
    const snap = await client(fixtureTransport([], { wpStatus: status })).woo.fetchSnapshot();
    expect(snap.wpProducts).toEqual([]);
    expect(snap.meta.wpProducts).toEqual({ complete: false, total: 3, fetched: 0 });
  });

  it.each([399, 500])("a %i, just outside 4xx, stops the read", async (status) => {
    await expect(client(fixtureTransport([], { wpStatus: status })).woo.fetchSnapshot()).rejects.toMatchObject({ status });
  });
});

describe("woo client — W21-live-2a-2a: stockOf retries and stops as every read does", () => {
  it("retries a 429 and a 5xx, waiting Retry-After first, and returns the facts", async () => {
    const calls: RecordedCall[] = [];
    const { woo, sleeps } = client(
      scripted([{ status: 429, headers: { "retry-after": "2" } }, { status: 503 }, { status: 200, body: [stockRow(101)] }], calls),
      { auth: KEY },
    );
    expect((await woo.stockOf([101])).get("101")).toEqual(stockRow(101));
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([2000, 1000]);
  });

  it("gives up after three retries and reports the status", async () => {
    const calls: RecordedCall[] = [];
    const { woo, sleeps } = client(scripted(Array(4).fill({ status: 500 }), calls), { auth: KEY });
    await expect(woo.stockOf([101])).rejects.toMatchObject({ status: 500 });
    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([500, 1000, 2000]);
  });

  it.each([400, 401, 403, 404])("stops at once on a %i: no retry and no wait, and never skipped as wp/v2's extras are", async (status) => {
    const calls: RecordedCall[] = [];
    const { woo, sleeps } = client(scripted([{ status }, { status: 200, body: [stockRow(101)] }], calls), { auth: KEY });
    const failure = await woo.stockOf([101]).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(WooHttpError);
    expect((failure as WooHttpError).status).toBe(status);
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it("does not follow a redirect with the key: it stops, and the key goes nowhere else", async () => {
    const calls: RecordedCall[] = [];
    const { woo } = client(scripted([{ status: 302, headers: { location: "https://elsewhere.example.test/" } }], calls), { auth: KEY });
    await expect(woo.stockOf([101])).rejects.toMatchObject({ status: 302 });
    expect(calls.map((c) => c.url.hostname)).toEqual(["shop.example.test"]);
  });

  it("checks the resolved host first, and a refusal sends nothing: no key goes to a private address", async () => {
    const transport = vi.fn<WooTransport>();
    const { woo } = client(transport, {
      auth: KEY,
      assertHostPublic: async (host) => {
        throw new Error(`refused ${host}`);
      },
    });
    await expect(woo.stockOf([101])).rejects.toThrow("refused shop.example.test");
    expect(transport).not.toHaveBeenCalled();
  });

  it("takes Woo's numeric ids and nothing else, at the type level (checked by tsc, never run)", () => {
    const { woo } = client(fixtureTransport(), { auth: KEY });
    const typeOnly = (): unknown[] => [
      // @ts-expect-error — an id here is the snapshot's number, not a mapped row's string
      woo.stockOf(["101"]),
    ];
    expect(typeof typeOnly).toBe("function");
  });
});
