import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Agentic endpoints — client errors MUST be 4xx, never 500.
 *
 * GET /api/products/search og POST /api/commerce/agent-checkout er de to
 * offentlige "AI-agent købsflow"-endpoints. Før dette fix kunne en klient
 * fremprovokere 500 med (a) `?limit=abc` (NaN nåede Prisma som `take: NaN`)
 * og (b) malformed JSON / ikke-numerisk `quantity` (exception væltede først
 * i Stripe-kaldet og røg i catch-all'en). En agent, der får 500, opgiver
 * butikken; en agent, der får 400 med en klar besked, retter sit kald.
 *
 * Kun lib-seams mockes (@/lib/db, @/lib/stripe, @/lib/brand, media-shim,
 * semantic search) — assertions pinner den rigtige route-wiring.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    product: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
  getStripeClient: vi.fn(),
  getBrand: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/stripe", () => ({ getStripeClient: mocks.getStripeClient }));
vi.mock("@/lib/brand", () => ({ getBrand: mocks.getBrand }));
vi.mock("@/lib/media/shim", () => ({ resolveProductImageUrls: () => [] }));
vi.mock("@/lib/search/semantic", () => ({ hybridRankProducts: vi.fn(async () => null) }));

import * as searchRoute from "@/app/api/products/search/route";
import { routing } from "@/i18n/routing";
import { formatPrice } from "@/lib/format";
import * as checkoutRoute from "@/app/api/commerce/agent-checkout/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.product.findMany.mockResolvedValue([]);
  mocks.prisma.product.findUnique.mockResolvedValue(null);
  mocks.getBrand.mockResolvedValue({
    storeName: "Test",
    url: "https://shop.example",
    policies: { currency: "DKK" },
  });
  mocks.getStripeClient.mockResolvedValue(null);
});

function searchReq(qs: string): Request {
  return new Request(`https://shop.example/api/products/search${qs}`);
}

function checkoutReq(body: string): Request {
  return new Request("https://shop.example/api/commerce/agent-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("GET /api/products/search — limit-parsing", () => {
  it("ikke-numerisk limit falder tilbage til 10 (aldrig NaN → 500)", async () => {
    const res = await searchRoute.GET(searchReq("?limit=abc"));
    expect(res.status).toBe(200);
    expect(mocks.prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
  });

  it("limit clampes opad til 50", async () => {
    const res = await searchRoute.GET(searchReq("?limit=500"));
    expect(res.status).toBe(200);
    expect(mocks.prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it("limit clampes nedad til 1 (0/negativ giver ikke tomt/ubegrænset svar)", async () => {
    const res = await searchRoute.GET(searchReq("?limit=0"));
    expect(res.status).toBe(200);
    expect(mocks.prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1 }),
    );
  });
});

describe("POST /api/commerce/agent-checkout — input-validering", () => {
  it("malformed JSON → 400 (ikke 500)", async () => {
    const res = await checkoutRoute.POST(checkoutReq("{not json"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid json/i);
  });

  it("manglende productId → 400", async () => {
    const res = await checkoutRoute.POST(checkoutReq(JSON.stringify({})));
    expect(res.status).toBe(400);
  });

  it("ikke-streng productId → 400", async () => {
    const res = await checkoutRoute.POST(
      checkoutReq(JSON.stringify({ productId: 123 })),
    );
    expect(res.status).toBe(400);
  });

  it.each([
    ["streng", "abc"],
    ["nul", 0],
    ["negativ", -1],
    ["decimal", 1.5],
    ["over loft", 1000],
  ])("ugyldig quantity (%s) → 400 med klar besked", async (_label, quantity) => {
    const res = await checkoutRoute.POST(
      checkoutReq(JSON.stringify({ productId: "p1", quantity })),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/quantity/i);
  });

  it("gyldigt input passerer valideringen (ukendt produkt → 404, ikke 400)", async () => {
    const res = await checkoutRoute.POST(
      checkoutReq(JSON.stringify({ productId: "p1", quantity: 2 })),
    );
    expect(res.status).toBe(404);
  });

  it("uden Stripe konfigureret → 503 (eksisterende kontrakt bevaret)", async () => {
    mocks.prisma.product.findUnique.mockResolvedValue({
      id: "p1",
      deletedAt: null,
      stock: 10,
      name: "Test",
      description: null,
      priceDkk: 1000,
      slug: "test",
      images: "[]",
    });
    const res = await checkoutRoute.POST(
      checkoutReq(JSON.stringify({ productId: "p1", quantity: 2 })),
    );
    expect(res.status).toBe(503);
  });
});

/**
 * The locale an agent gets is the locale of the page it asked from.
 *
 * `resolveRequestLocale` had a thorough unit test of its own and NOTHING tied
 * it to its only call site — so reverting the route to
 * `const locale = brand.defaultLocale`, a plausible move during a conflict
 * resolution, passed the whole suite and typecheck while restoring the
 * measured live defect: an agent on /en searching "ethiopia" handed back
 * /da/product/ethiopia-yirgacheffe and "149,00 kr.", pulling the conversation
 * into Danish. A guard on the resolver alone cannot see that; this exercises
 * the route.
 */
describe("GET /api/products/search answers in the caller's language", () => {
  const ETHIOPIA = {
    id: "p1",
    name: "Ethiopia Yirgacheffe",
    slug: "ethiopia-yirgacheffe",
    description: "Bright, floral single-origin.",
    brand: null,
    priceDkk: 14900,
    stock: 5,
    images: "[]",
    attributes: { weightG: 250 },
  };

  const fromPage = async (referer: string | null) => {
    mocks.prisma.product.findMany.mockResolvedValue([ETHIOPIA]);
    const req = new Request("https://shop.example/api/products/search?q=ethiopia", {
      headers: referer ? { Referer: referer } : {},
    });
    const res = await searchRoute.GET(req);
    return (await res.json()).products[0];
  };

  // The shop's OWN locales, not two literals. This file ships to every
  // customer scaffold (only tests/e2e is mirror-excluded), and the first
  // version hardcoded "da" as the fallback and "DKK 149.00" as the English
  // rendering — so the northbound demo, which is English-first, failed a test
  // it never wrote the moment it rebuilt off main. Same fork-hostility the
  // shipping-copy guard had, one file over.
  const [first, second] = routing.locales;
  const other = second ?? first;

  it("follows the Referer into the shop's first locale", async () => {
    const p = await fromPage(`https://shop.example/${first}/produkter`);
    expect(p.url).toContain(`/${first}/product/`);
    expect(p.unitPrice.formatted).toBe(formatPrice(14900, { locale: first }));
  });

  it("follows the Referer into another of its locales", async () => {
    const p = await fromPage(`https://shop.example/${other}/produkter`);
    expect(p.url).toContain(`/${other}/product/`);
    expect(p.unitPrice.formatted).toBe(formatPrice(14900, { locale: other }));
  });

  it("the explicit param beats the Referer", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([ETHIOPIA]);
    const res = await searchRoute.GET(
      new Request(`https://shop.example/api/products/search?q=ethiopia&locale=${first}`, {
        headers: { Referer: `https://shop.example/${other}/produkter` },
      }),
    );
    expect((await res.json()).products[0].url).toContain(`/${first}/product/`);
  });

  it("falls back to the shop default with nothing to read", async () => {
    // The case this CANNOT fix, pinned so the fallback is a decision and not
    // an accident: a direct HTTP agent expressed no preference.
    const p = await fromPage(null);
    expect(p.url).toContain(`/${routing.defaultLocale}/product/`);
  });

  it("the locales actually differ (vacuous on a single-locale shop)", async () => {
    if (routing.locales.length < 2) return; // nothing to distinguish
    const a = await fromPage(`https://shop.example/${first}/produkter`);
    const b = await fromPage(`https://shop.example/${other}/produkter`);
    expect(a.url).not.toBe(b.url);
    expect(a.unitPrice.formatted).not.toBe(b.unitPrice.formatted);
  });
});

/**
 * Multi-word search, through the ROUTE — not through the matcher in isolation.
 *
 * The guard for this was a source grep, and it was satisfied by the surviving
 * import line: reverting the filter to `.includes(q.toLowerCase())` passed
 * lint, typecheck and every test. What that silently drops is word ORDER and
 * query-side punctuation, which is the whole point of tokenising. So it is
 * asserted here, where the behaviour actually lives.
 */
describe("GET /api/products/search matches words, not the whole phrase", () => {
  const V60 = {
    id: "p2",
    name: "Hario V60 Dripper (02)",
    slug: "hario-v60-dripper-02",
    description: "The pour-over classic. Ceramic 02 dripper for 1-4 cups.",
    brand: null,
    priceDkk: 19900,
    stock: 3,
    images: "[]",
    attributes: null,
  };

  const hits = async (q: string) => {
    mocks.prisma.product.findMany.mockResolvedValue([V60]);
    const res = await searchRoute.GET(
      new Request(`https://shop.example/api/products/search?q=${encodeURIComponent(q)}`),
    );
    return (await res.json()).products.length;
  };

  it("finds it however the words are ordered", async () => {
    expect(await hits("hario dripper")).toBe(1);
    expect(await hits("dripper hario")).toBe(1);
  });

  it("does not care about the query's punctuation or case", async () => {
    expect(await hits("pour-over")).toBe(1);
    expect(await hits("pour over")).toBe(1);
    expect(await hits("POUR OVER")).toBe(1);
  });

  it("still requires EVERY word", async () => {
    // The other half: tokenising must narrow, not widen.
    expect(await hits("hario kettle")).toBe(0);
  });

  it("finds nothing for a word the product does not have", async () => {
    // Anti-vacuity: if everything matched, the cases above prove nothing.
    expect(await hits("espresso")).toBe(0);
  });
});
