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
