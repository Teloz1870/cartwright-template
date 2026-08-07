import { describe, it, expect, vi, beforeEach } from "vitest";

import type { CatalogFeedItem } from "@/lib/feeds/catalog-feed";

/**
 * Moat regression — the two agentic-discovery FEED ROUTE HANDLERS:
 *   GET /api/acp/feed   (OpenAI Agentic Commerce Protocol product feed, JSONL)
 *   GET /feed/google.xml (Google Merchant Center product feed, RSS 2.0 + g:)
 *
 * Both serializers (`buildAcpFeed`, `buildGoogleMerchantXml`) and the shared
 * neutral builder (`getCatalogFeed`, #346) are separately unit-tested. What was
 * UNCOVERED until this file (noted 2026-07-05, after #349) is the ROUTE WIRING:
 * the options each handler threads into its serializer, its 404 gating, its
 * cache headers. A regression there silently corrupts what AI shopping agents read,
 * with every serializer test still green.
 *
 * Design: mock the serializers as SPIES so the assertions pin the ROUTE's
 * wiring (which options object it builds, its short-circuit, its headers),
 * independent of serializer output — the serializers own their own tests. The
 * two moat invariants this locks:
 *   1. ACP Phase-A discipline — the route hard-codes `eligibleSearch:true,
 *      eligibleCheckout:false`. Checkout MUST NOT be advertised until Stripe
 *      SPT-checkout is live; a flip to `true` would tell agents they can buy
 *      directly when they can't.
 *   2. Google `native_commerce` advertise-iff-flag — `nativeCommerce` is
 *      `Boolean(merged.features.acp)`, and the whole route is behind the
 *      `ecommerceEnabled && merchantFeed` 404 double-gate.
 *
 * The route handlers are `async` → their `Response` IS awaited.
 */

const mocks = vi.hoisted(() => ({
  // getBrand() — the runtime-merged brand the routes read.
  merged: {
    storeName: "Merged Store",
    url: "https://shop.example",
    policies: { country: "DK" },
    ecommerceEnabled: true,
    features: { merchantFeed: true, acp: false } as {
      merchantFeed?: boolean;
      acp?: boolean;
    },
  },
  // @/brand.config `brand` — google.xml reads title/description from the STATIC
  // config, NOT from the merged brand. Kept deliberately distinct to prove it.
  config: {
    storeName: "Config Store",
    metadata: { description: "Config description." },
  },
  items: [] as CatalogFeedItem[],
  getCatalogFeed: vi.fn(),
  buildAcpFeed: vi.fn(),
  buildGoogleMerchantXml: vi.fn(),
}));

vi.mock("@/lib/brand", () => ({ getBrand: async () => mocks.merged }));
vi.mock("@/brand.config", () => ({ brand: mocks.config }));
vi.mock("@/lib/feeds/catalog-feed", () => ({
  getCatalogFeed: mocks.getCatalogFeed,
}));
vi.mock("@/lib/feeds/acp-feed", () => ({ buildAcpFeed: mocks.buildAcpFeed }));
vi.mock("@/lib/feeds/google-merchant", () => ({
  buildGoogleMerchantXml: mocks.buildGoogleMerchantXml,
}));

import * as acpRoute from "@/app/api/acp/feed/route";
import * as googleRoute from "@/app/feed/google.xml/route";

const sampleItems: CatalogFeedItem[] = [
  {
    id: "sku-1",
    title: "Aviator",
    description: "Klassiske aviator-solbriller",
    priceMinor: 12900,
    currency: "DKK",
    availability: "in_stock",
    url: "https://shop.example/product/aviator",
    imageUrl: "https://shop.example/img/aviator.jpg",
    brand: "RayCraft",
    category: "Sunglasses",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.merged.storeName = "Merged Store";
  mocks.merged.url = "https://shop.example";
  mocks.merged.policies = { country: "DK" };
  mocks.merged.ecommerceEnabled = true;
  mocks.merged.features = { merchantFeed: true, acp: false };
  mocks.config.storeName = "Config Store";
  mocks.config.metadata = { description: "Config description." };
  mocks.items = sampleItems;
  mocks.getCatalogFeed.mockResolvedValue(mocks.items);
  mocks.buildAcpFeed.mockReturnValue("<acp-jsonl>");
  mocks.buildGoogleMerchantXml.mockReturnValue("<xml/>");
});

describe("GET /api/acp/feed — ACP product feed route", () => {
  it("is served force-dynamic", () => {
    expect(acpRoute.dynamic).toBe("force-dynamic");
  });

  it("404s and short-circuits (no catalog fetch, no serialize) in website mode", async () => {
    // Website-mode parity (#350 filed it as the ungated wart; gated 2026-07-15):
    // a site without products must not expose an ACP product feed. Same first
    // conjunct as the Google route; deliberately NO features.acp conjunct —
    // the feed is every webshop's discovery surface, checkout gates separately.
    mocks.merged.ecommerceEnabled = false;
    const res = await acpRoute.GET();
    expect(res.status).toBe(404);
    expect(mocks.getCatalogFeed).not.toHaveBeenCalled();
    expect(mocks.buildAcpFeed).not.toHaveBeenCalled();
  });

  it("serves the feed for a webshop even when features.acp is OFF (discovery ≠ checkout)", async () => {
    mocks.merged.ecommerceEnabled = true;
    mocks.merged.features = { merchantFeed: true, acp: false };
    const res = await acpRoute.GET();
    expect(res.status).toBe(200);
    expect(mocks.buildAcpFeed).toHaveBeenCalledTimes(1);
  });

  it("threads the Phase-A discovery seller options into buildAcpFeed (checkout NOT eligible)", async () => {
    await acpRoute.GET();
    expect(mocks.buildAcpFeed).toHaveBeenCalledTimes(1);
    const [items, seller] = mocks.buildAcpFeed.mock.calls[0];
    // items come straight from the shared builder.
    expect(items).toBe(mocks.items);
    expect(seller).toEqual({
      name: "Merged Store",
      url: "https://shop.example",
      storeCountry: "DK",
      targetCountries: ["DK"],
      privacyPolicyUrl: "https://shop.example/info/privacy",
      tosUrl: "https://shop.example/info/terms",
      eligibleSearch: true,
      // MOAT INVARIANT: discovery only until Stripe SPT-checkout is live.
      eligibleCheckout: false,
    });
  });

  it("strips a trailing slash from brand.url before deriving base + policy URLs", async () => {
    mocks.merged.url = "https://shop.example///";
    await acpRoute.GET();
    const [, seller] = mocks.buildAcpFeed.mock.calls[0];
    expect(seller.url).toBe("https://shop.example");
    expect(seller.privacyPolicyUrl).toBe("https://shop.example/info/privacy");
    expect(seller.tosUrl).toBe("https://shop.example/info/terms");
  });

  it("uses brand.policies.country as both store and target country", async () => {
    mocks.merged.policies = { country: "SE" };
    await acpRoute.GET();
    const [, seller] = mocks.buildAcpFeed.mock.calls[0];
    expect(seller.storeCountry).toBe("SE");
    expect(seller.targetCountries).toEqual(["SE"]);
  });

  it("returns the serializer output with JSONL content-type + 15-min public cache", async () => {
    const res = await acpRoute.GET();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<acp-jsonl>");
    expect(res.headers.get("content-type")).toBe(
      "application/jsonl; charset=utf-8",
    );
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=900, s-maxage=900",
    );
  });
});

describe("GET /feed/google.xml — Google Merchant feed route", () => {
  it("is served force-dynamic", () => {
    expect(googleRoute.dynamic).toBe("force-dynamic");
  });

  it("404s and short-circuits (no catalog fetch) when merchantFeed is off", async () => {
    mocks.merged.features = { merchantFeed: false, acp: false };
    const res = await googleRoute.GET();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
    expect(mocks.getCatalogFeed).not.toHaveBeenCalled();
    expect(mocks.buildGoogleMerchantXml).not.toHaveBeenCalled();
  });

  it("404s when ecommerceEnabled is off even with merchantFeed on (both conjuncts required)", async () => {
    mocks.merged.ecommerceEnabled = false;
    mocks.merged.features = { merchantFeed: true, acp: false };
    const res = await googleRoute.GET();
    expect(res.status).toBe(404);
    expect(mocks.getCatalogFeed).not.toHaveBeenCalled();
  });

  it("404s when the merchantFeed flag is absent entirely", async () => {
    mocks.merged.features = {};
    const res = await googleRoute.GET();
    expect(res.status).toBe(404);
  });

  it("builds the channel from the STATIC brand.config (not the merged brand) with a slash-stripped link", async () => {
    mocks.merged.url = "https://shop.example/";
    const res = await googleRoute.GET();
    expect(res.status).toBe(200);
    expect(mocks.buildGoogleMerchantXml).toHaveBeenCalledTimes(1);
    const [items, channel] = mocks.buildGoogleMerchantXml.mock.calls[0];
    expect(items).toBe(mocks.items);
    expect(channel).toEqual({
      title: "Config Store", // from @/brand.config, not merged.storeName
      link: "https://shop.example", // merged.url, trailing slash stripped
      description: "Config description.",
    });
  });

  it("advertises native_commerce IFF features.acp is on", async () => {
    // acp off (default) → nativeCommerce false
    await googleRoute.GET();
    expect(mocks.buildGoogleMerchantXml.mock.calls[0][2]).toEqual({
      nativeCommerce: false,
    });

    // acp on → nativeCommerce true
    vi.clearAllMocks();
    mocks.getCatalogFeed.mockResolvedValue(mocks.items);
    mocks.buildGoogleMerchantXml.mockReturnValue("<xml/>");
    mocks.merged.features = { merchantFeed: true, acp: true };
    await googleRoute.GET();
    expect(mocks.buildGoogleMerchantXml.mock.calls[0][2]).toEqual({
      nativeCommerce: true,
    });
  });

  it("returns the serializer output with XML content-type + 15-min public cache", async () => {
    const res = await googleRoute.GET();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<xml/>");
    expect(res.headers.get("content-type")).toBe(
      "application/xml; charset=utf-8",
    );
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=900, s-maxage=900",
    );
  });
});
