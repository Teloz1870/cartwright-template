import { describe, expect, it, vi } from "vitest";

import {
  WooHttpError,
  createWooClient,
  type WooClientOptions,
  type WooRequestInit,
  type WooTransport,
} from "@/lib/woo/client";
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
