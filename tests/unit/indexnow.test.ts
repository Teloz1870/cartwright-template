/**
 * FEAT3-a — IndexNow ping on publish (flag indexNow) + the key file route.
 *
 * `fetch` is stubbed, `getBrand` is mocked, `after` is stubbed to a queue
 * (drained by hand, the way the runtime would post-response) or made to throw
 * (outside a request scope), env is stubbed per test: nothing here reaches a
 * network or a database.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBrand: vi.fn(),
  after: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
}));

vi.mock("@/lib/brand", () => ({ getBrand: mocks.getBrand }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (cb: () => unknown) => mocks.after(cb) };
});

import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY_PATH,
  indexNowKey,
  indexNowOrigin,
  indexNowPath,
  indexNowPathsForChange,
  indexNowUrlList,
  pingIndexNow,
  scheduleIndexNowPing,
} from "@/lib/indexnow";
import * as keyRoute from "@/app/.well-known/indexnow-key.txt/route";

const KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";

function brandWith(
  features: Record<string, boolean>,
  url = "https://shop.dk",
  locales: readonly string[] = ["da", "en"],
  ecommerceEnabled = true,
) {
  return { features, url, locales, ecommerceEnabled };
}

function lastBody(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  const init = fetchMock.mock.calls[call][1] as RequestInit;
  return JSON.parse(String(init.body)) as {
    host: string;
    key: string;
    keyLocation: string;
    urlList: string[];
  };
}

/** Drain whatever `after()` scheduled, the way the runtime would post-response. */
async function drainAfter() {
  for (const cb of mocks.afterCallbacks.splice(0)) await cb();
}

describe("pingIndexNow", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("INDEXNOW_KEY", KEY);
    vi.stubEnv("VERCEL_ENV", "production");
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.getBrand.mockReset();
    mocks.getBrand.mockResolvedValue(brandWith({ indexNow: true, blog: true }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends nothing while the flag is off (the default)", async () => {
    mocks.getBrand.mockResolvedValue(brandWith({ indexNow: false }));
    await pingIndexNow([indexNowPath.product("mug")]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("sends nothing when INDEXNOW_KEY is unset — and never reads the brand for it", async () => {
    vi.stubEnv("INDEXNOW_KEY", "");
    await pingIndexNow([indexNowPath.product("mug")]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.getBrand).not.toHaveBeenCalled();
  });

  it("treats a malformed key as unset (IndexNow keys are 8–128 chars of [A-Za-z0-9-])", async () => {
    vi.stubEnv("INDEXNOW_KEY", "short!");
    expect(indexNowKey()).toBeNull();
    await pingIndexNow([indexNowPath.product("mug")]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing for an empty list", async () => {
    await pingIndexNow([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.getBrand).not.toHaveBeenCalled();
  });

  it.each([
    ["http://shop.dk", "production"],
    ["https://localhost:3000", "production"],
    ["https://127.0.0.1", "production"],
    ["https://shop.localhost", "production"],
    ["https://shop.dk", "preview"],
    ["https://shop.dk", "development"],
    ["not a url", "production"],
  ])("stays silent on a non-production host (%s, VERCEL_ENV=%s)", async (url, vercelEnv) => {
    vi.stubEnv("VERCEL_ENV", vercelEnv);
    mocks.getBrand.mockResolvedValue(brandWith({ indexNow: true }, url));
    expect(indexNowOrigin(url)).toBeNull();
    await pingIndexNow([indexNowPath.product("mug")]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("off Vercel (VERCEL_ENV unset)", () => {
    beforeEach(() => vi.stubEnv("VERCEL_ENV", ""));

    it.each(["development", "test", ""])(
      "never pings from a non-production build (NODE_ENV=%s) — `pnpm dev` with the real brand.url stays silent",
      async (nodeEnv) => {
        vi.stubEnv("NODE_ENV", nodeEnv);
        expect(indexNowOrigin("https://shop.dk")).toBeNull();
        await pingIndexNow([indexNowPath.product("mug")]);
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );

    it("pings from a production build on a real host", async () => {
      vi.stubEnv("NODE_ENV", "production");
      expect(indexNowOrigin("https://shop.dk")).toBe("https://shop.dk");
      await pingIndexNow([indexNowPath.product("mug")]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("refuses a *.vercel.app host it is not deployed on", () => {
      vi.stubEnv("NODE_ENV", "production");
      expect(indexNowOrigin("https://teloz-showcase.vercel.app")).toBeNull();
    });

    it("never pings the vendor host — the unconfigured brand.url fallback is not this shop", async () => {
      // No domain row, no NEXT_PUBLIC_APP_URL, no VERCEL_*: brand.url resolves
      // to the engine's placeholder. A self-hosted production shop must not
      // tell IndexNow about cartwright.app with its own key.
      vi.stubEnv("NODE_ENV", "production");
      mocks.getBrand.mockResolvedValue(brandWith({ indexNow: true }, "https://cartwright.app"));
      expect(indexNowOrigin("https://cartwright.app")).toBeNull();
      await pingIndexNow([indexNowPath.product("mug")]);
      expect(fetchMock).not.toHaveBeenCalled();
      // A shop ON a vendor subdomain (demo.cartwright.app) is its own origin and still pings.
      expect(indexNowOrigin("https://demo.cartwright.app")).toBe("https://demo.cartwright.app");
    });
  });

  it("pings a shop whose PRODUCTION host is *.vercel.app (VERCEL_ENV=production)", async () => {
    mocks.getBrand.mockResolvedValue(brandWith({ indexNow: true }, "https://my-shop.vercel.app"));
    expect(indexNowOrigin("https://my-shop.vercel.app")).toBe("https://my-shop.vercel.app");
    await pingIndexNow([indexNowPath.product("mug")]);
    expect(lastBody(fetchMock).host).toBe("my-shop.vercel.app");
  });

  it("POSTs one JSON body with host, key, keyLocation and every locale's URL", async () => {
    await pingIndexNow([indexNowPath.product("mug"), indexNowPath.page("om-os")]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(INDEXNOW_ENDPOINT);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toContain("application/json");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(lastBody(fetchMock)).toEqual({
      host: "shop.dk",
      key: KEY,
      keyLocation: `https://shop.dk${INDEXNOW_KEY_PATH}`,
      urlList: [
        "https://shop.dk/da/product/mug",
        "https://shop.dk/en/product/mug",
        "https://shop.dk/da/about",
        "https://shop.dk/en/about",
      ],
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("sends `host` as the hostname — never with a port", async () => {
    mocks.getBrand.mockResolvedValue(brandWith({ indexNow: true }, "https://shop.dk:8443"));
    await pingIndexNow([indexNowPath.product("mug")]);
    const body = lastBody(fetchMock);
    expect(body.host).toBe("shop.dk");
    expect(body.keyLocation).toBe(`https://shop.dk:8443${INDEXNOW_KEY_PATH}`);
    expect(body.urlList[0]).toBe("https://shop.dk:8443/da/product/mug");
  });

  it("skips product pings while ecommerce is off — the sitemap lists no product URLs either", async () => {
    mocks.getBrand.mockResolvedValue(brandWith({ indexNow: true }, "https://shop.dk", ["da"], false));
    await pingIndexNow([indexNowPath.product("mug")], "product");
    expect(fetchMock).not.toHaveBeenCalled();
    await pingIndexNow([indexNowPath.page("terms")], "page");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips post pings while the blog is off — the sitemap lists no post URLs either", async () => {
    mocks.getBrand.mockResolvedValue(brandWith({ indexNow: true, blog: false }));
    await pingIndexNow([indexNowPath.post("spring")], "post");
    expect(fetchMock).not.toHaveBeenCalled();
    mocks.getBrand.mockResolvedValue(brandWith({ indexNow: true, blog: true }));
    await pingIndexNow([indexNowPath.post("spring")], "post");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("dedupes repeated paths and drops anything that is not a site path", () => {
    const urls = indexNowUrlList(
      ["/{locale}/product/mug", "/{locale}/product/mug", "/llms.txt", "https://evil.example/x", "mug"],
      ["da", "en"],
      "https://shop.dk",
    );
    expect(urls).toEqual([
      "https://shop.dk/da/product/mug",
      "https://shop.dk/en/product/mug",
      "https://shop.dk/llms.txt",
    ]);
  });

  it("chunks at 100 URLs per call", async () => {
    const paths = Array.from({ length: 101 }, (_, i) => `/static-${i}`);
    await pingIndexNow(paths);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lastBody(fetchMock, 0).urlList).toHaveLength(100);
    expect(lastBody(fetchMock, 1).urlList).toEqual(["https://shop.dk/static-100"]);
  });

  it("resolves without throwing when fetch rejects, warning once", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    await expect(pingIndexNow([indexNowPath.product("mug")])).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("[indexnow]");
  });

  it("warns once on a non-2xx answer and still resolves", async () => {
    fetchMock.mockResolvedValue(new Response("bad key", { status: 403 }));
    await expect(pingIndexNow([indexNowPath.product("mug")])).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][1])).toContain("403");
  });

  it("resolves without throwing when the brand read itself fails", async () => {
    mocks.getBrand.mockRejectedValue(new Error("db down"));
    await expect(pingIndexNow([indexNowPath.product("mug")])).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("indexNowPathsForChange — which URLs a write pings", () => {
  const product = (slug: string) => indexNowPath.product(slug);

  it.each([
    ["create, public", { newSlug: "mug", wasPublic: false, isPublic: true }, [product("mug")]],
    ["create as draft", { newSlug: "mug", wasPublic: false, isPublic: false }, []],
    ["edit, public, same slug", { oldSlug: "mug", newSlug: "mug", wasPublic: true, isPublic: true }, [product("mug")]],
    ["edit, draft stays draft", { oldSlug: "mug", newSlug: "mug", wasPublic: false, isPublic: false }, []],
    ["publish (draft → published)", { oldSlug: "mug", newSlug: "mug", wasPublic: false, isPublic: true }, [product("mug")]],
    ["unpublish (published → draft)", { oldSlug: "mug", newSlug: "mug", wasPublic: true, isPublic: false }, [product("mug")]],
    ["rename, public: old AND new", { oldSlug: "mug", newSlug: "cup", wasPublic: true, isPublic: true }, [product("cup"), product("mug")]],
    ["rename + publish: new only (old was never public)", { oldSlug: "mug", newSlug: "cup", wasPublic: false, isPublic: true }, [product("cup")]],
    ["rename + unpublish: old only (new is a draft)", { oldSlug: "mug", newSlug: "cup", wasPublic: true, isPublic: false }, [product("mug")]],
    ["delete, was public", { oldSlug: "mug", wasPublic: true, isPublic: false }, [product("mug")]],
    ["delete a draft", { oldSlug: "mug", wasPublic: false, isPublic: false }, []],
  ])("%s", (_name, change, expected) => {
    expect(indexNowPathsForChange({ kind: "product", ...change })).toEqual(expected);
  });

  it("routes each kind through its own path template", () => {
    expect(indexNowPathsForChange({ kind: "page", newSlug: "om-os", wasPublic: false, isPublic: true })).toEqual(["/{locale}/about"]);
    expect(indexNowPathsForChange({ kind: "post", newSlug: "spring", wasPublic: false, isPublic: true })).toEqual(["/{locale}/blog/spring"]);
  });
});

describe("scheduleIndexNowPing — the POST outlives the response on serverless", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("INDEXNOW_KEY", KEY);
    vi.stubEnv("VERCEL_ENV", "production");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.getBrand.mockReset().mockResolvedValue(brandWith({ indexNow: true, blog: true }));
    mocks.after.mockReset();
    mocks.afterCallbacks.length = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("inside a request scope: registers the ping with after() and only fetches once the runtime drains it", async () => {
    mocks.after.mockImplementation((cb: () => unknown) => {
      mocks.afterCallbacks.push(cb);
    });
    scheduleIndexNowPing({ kind: "product", oldSlug: "mug", newSlug: "cup", wasPublic: true, isPublic: true });
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    await drainAfter();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastBody(fetchMock).urlList).toEqual([
      "https://shop.dk/da/product/cup",
      "https://shop.dk/en/product/cup",
      "https://shop.dk/da/product/mug",
      "https://shop.dk/en/product/mug",
    ]);
  });

  it("outside a request scope (after() throws): falls back to a loose promise and still pings", async () => {
    mocks.after.mockImplementation(() => {
      throw new Error("`after()` was called outside a request scope");
    });
    expect(() =>
      scheduleIndexNowPing({ kind: "page", oldSlug: "terms", wasPublic: true, isPublic: false }),
    ).not.toThrow();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(lastBody(fetchMock).urlList).toEqual(["https://shop.dk/da/info/terms", "https://shop.dk/en/info/terms"]);
  });

  it("schedules nothing when the change has no public URL (a draft edit)", () => {
    mocks.after.mockImplementation((cb: () => unknown) => {
      mocks.afterCallbacks.push(cb);
    });
    scheduleIndexNowPing({ kind: "post", oldSlug: "x", newSlug: "x", wasPublic: false, isPublic: false });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("carries the kind through, so the ecommerce/blog gates apply to a scheduled ping", async () => {
    mocks.after.mockImplementation((cb: () => unknown) => {
      mocks.afterCallbacks.push(cb);
    });
    mocks.getBrand.mockResolvedValue(brandWith({ indexNow: true, blog: false }));
    scheduleIndexNowPing({ kind: "post", newSlug: "spring", wasPublic: false, isPublic: true });
    await drainAfter();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("indexNowPath", () => {
  it("mirrors the storefront routes the sitemap lists", () => {
    expect(indexNowPath.product("mug")).toBe("/{locale}/product/mug");
    expect(indexNowPath.post("spring")).toBe("/{locale}/blog/spring");
    expect(indexNowPath.page("terms")).toBe("/{locale}/info/terms");
    // Trust aliases resolve to their canonical route, like the router does.
    expect(indexNowPath.page("om-os")).toBe("/{locale}/about");
    expect(indexNowPath.page("privacy")).toBe("/{locale}/privacy");
  });
});

describe("GET /.well-known/indexnow-key.txt", () => {
  beforeEach(() => {
    vi.stubEnv("INDEXNOW_KEY", KEY);
    mocks.getBrand.mockReset();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("serves the key as text/plain, uncached, when the flag is on and the key is set", async () => {
    mocks.getBrand.mockResolvedValue(brandWith({ indexNow: true }));
    const res = await keyRoute.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe(KEY);
  });

  it("is 404 while the flag is off, even with a key configured", async () => {
    mocks.getBrand.mockResolvedValue(brandWith({ indexNow: false }));
    const res = await keyRoute.GET();
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain(KEY);
  });

  it("is 404 when the key is unset, even with the flag on", async () => {
    vi.stubEnv("INDEXNOW_KEY", "");
    mocks.getBrand.mockResolvedValue(brandWith({ indexNow: true }));
    const res = await keyRoute.GET();
    expect(res.status).toBe(404);
  });

  it("gates OPTIONS the same way: 404 when off, 204 + Allow when on", async () => {
    expect(typeof keyRoute.OPTIONS).toBe("function");
    mocks.getBrand.mockResolvedValue(brandWith({ indexNow: false }));
    const shut = await keyRoute.OPTIONS();
    expect(shut.status).toBe(404);
    expect(shut.headers.get("allow")).toBeNull();

    mocks.getBrand.mockResolvedValue(brandWith({ indexNow: true }));
    const open = await keyRoute.OPTIONS();
    expect(open.status).toBe(204);
    expect(open.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
  });
});
