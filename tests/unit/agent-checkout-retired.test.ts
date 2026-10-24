import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * B84 — /api/commerce/agent-checkout is retired, and nothing advertises it.
 *
 * The route created a Stripe Checkout Session for one product with no order
 * behind it: the webhook skips a session without an `orderId`, so the buyer
 * paid, the shop recorded nothing and the success page was a 404. Every
 * `/api/products/search` row handed agents its address as `checkoutEndpoint`.
 *
 * Pinned here: every verb answers 410 problem+json before any Stripe, database
 * or brand-row call; the answer names the ACP checkout only where that
 * checkout can take the payment — `brand.acp.enabled` mounts /api/acp/v1/* and
 * env `ACP_PAYMENT_COMPLETION=1` runs `/complete`, which otherwise answers 501
 * (llms.txt tells agents not to call /api/acp/* where ACP is off); and the
 * search rows no longer carry the field.
 */

const mocks = vi.hoisted(() => ({
  acp: { enabled: false },
  getStripeClient: vi.fn(),
  getBrand: vi.fn(),
  prisma: { product: { findMany: vi.fn(), findUnique: vi.fn() } },
}));

// The real config, with only the ACP switch under the test's control — the
// search route reads routing and URL options from the rest of it.
vi.mock("@/brand.config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/brand.config")>();
  return { ...actual, brand: { ...actual.brand, acp: mocks.acp } };
});
vi.mock("@/lib/stripe", () => ({ getStripeClient: mocks.getStripeClient }));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/brand", () => ({ getBrand: mocks.getBrand }));
vi.mock("@/lib/media/shim", () => ({ resolveProductImageUrls: () => [] }));
vi.mock("@/lib/search/semantic", () => ({ hybridRankProducts: vi.fn(async () => null) }));
// Only so `isAcpCompletionEnabled` can be imported for the parity check below.
vi.mock("@/lib/orders/create-acp", () => ({ createOrderFromAcpSession: vi.fn() }));

import * as checkoutRoute from "@/app/api/commerce/agent-checkout/route";
import * as searchRoute from "@/app/api/products/search/route";
import { isAcpCompletionEnabled } from "@/lib/acp/complete";

const URL_ = "https://shop.example/api/commerce/agent-checkout";
// Every verb a route module can export except OPTIONS, which stays the
// framework's 204 + Allow (options-preflight-gate.test.ts classifies every
// hand-written one; this route has no gate for a preflight to consult).
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.acp.enabled = false;
  delete process.env.ACP_PAYMENT_COMPLETION;
  mocks.getBrand.mockResolvedValue({
    storeName: "Test",
    url: "https://shop.example",
    policies: { currency: "DKK" },
  });
  // A connected Stripe and an in-stock product: everything the old POST
  // needed to open a payment page. It must still not get one.
  const create = vi.fn(async () => ({ url: "https://checkout.stripe.test/s", expires_at: 1 }));
  mocks.getStripeClient.mockResolvedValue({ checkout: { sessions: { create } } });
  mocks.prisma.product.findUnique.mockResolvedValue({
    id: "p1",
    deletedAt: null,
    stock: 10,
    name: "Test",
    description: null,
    priceDkk: 1000,
    slug: "test",
    permalink: null,
    images: "[]",
  });
});

afterEach(() => {
  delete process.env.ACP_PAYMENT_COMPLETION;
});

function setCompletionEnv(value: string | undefined) {
  if (value === undefined) delete process.env.ACP_PAYMENT_COMPLETION;
  else process.env.ACP_PAYMENT_COMPLETION = value;
}

async function expectProductPageAnswer(res: Response) {
  expect(res.status).toBe(410);
  expect(res.headers.get("link")).toBeNull();
  const body = await res.json();
  expect(JSON.stringify(body)).not.toContain("/api/acp");
  expect(body.resolution).toMatch(/product's url/);
}

function call(method: (typeof METHODS)[number]) {
  const handler = checkoutRoute[method];
  expect(handler, `${method} is exported`).toBeTypeOf("function");
  const withBody = method !== "GET" && method !== "HEAD";
  return handler(
    new Request(URL_, {
      method,
      ...(withBody
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId: "p1", quantity: 1 }),
          }
        : {}),
    }),
  );
}

describe("/api/commerce/agent-checkout answers 410 Gone", () => {
  it.each(METHODS)("%s → 410 problem+json, with no Stripe or database call", async (method) => {
    const res = await call(method);
    expect(res.status).toBe(410);
    expect(res.headers.get("content-type")).toBe("application/problem+json");
    const body = await res.json();
    expect(body).toMatchObject({
      status: 410,
      code: "agent_checkout_retired",
      instance: "/api/commerce/agent-checkout",
      ok: false,
    });
    expect(body.detail).toMatch(/retired/i);
    expect(mocks.getStripeClient).not.toHaveBeenCalled();
    expect(mocks.prisma.product.findUnique).not.toHaveBeenCalled();
    expect(mocks.getBrand).not.toHaveBeenCalled();
  });

  it("leaves OPTIONS to the framework", () => {
    expect("OPTIONS" in checkoutRoute).toBe(false);
  });

  it("points to the ACP checkout where it can take the payment", async () => {
    mocks.acp.enabled = true;
    process.env.ACP_PAYMENT_COMPLETION = "1";
    const res = await call("POST");
    expect(res.status).toBe(410);
    expect(res.headers.get("link")).toBe('</api/acp/v1/checkout_sessions>; rel="successor-version"');
    const { resolution } = await res.json();
    expect(resolution).toContain("POST /api/acp/v1/checkout_sessions");
    expect(resolution).toContain("/api/acp/v1/checkout_sessions/{id}/complete");
  });

  it.each([undefined, "1"])(
    "does not send an agent to /api/acp/* on a shop without ACP (ACP_PAYMENT_COMPLETION=%s)",
    async (env) => {
      setCompletionEnv(env);
      await expectProductPageAnswer(await call("POST"));
    },
  );

  // ACP on, payment step off — the default for a shop that turns ACP on:
  // sessions open, but /complete answers 501, so the buyer could never pay.
  it.each([undefined, "0", "true"])(
    "does not send an agent into an ACP checkout whose payment step is off (ACP_PAYMENT_COMPLETION=%s)",
    async (env) => {
      mocks.acp.enabled = true;
      setCompletionEnv(env);
      await expectProductPageAnswer(await call("POST"));
    },
  );

  // The route reads the env switch itself instead of importing it (it sits in
  // the webshop module, lib/acp in the acp module). It must agree with the
  // gate /complete actually runs behind, for every value.
  it.each([undefined, "", "0", "1", "true", " 1", "yes"])(
    "names ACP exactly when /complete would take the payment (ACP_PAYMENT_COMPLETION=%j)",
    async (env) => {
      mocks.acp.enabled = true;
      setCompletionEnv(env);
      const res = await call("POST");
      expect(res.headers.get("link") !== null).toBe(isAcpCompletionEnabled());
    },
  );
});

describe("/api/products/search no longer advertises a checkout endpoint", () => {
  it("rows carry no checkoutEndpoint and name no agent-checkout path", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([
      {
        id: "p1",
        name: "Ethiopia Yirgacheffe",
        slug: "ethiopia-yirgacheffe",
        permalink: null,
        description: "Bright, floral single-origin.",
        brand: null,
        priceDkk: 14900,
        stock: 5,
        images: "[]",
        attributes: null,
      },
    ]);
    const res = await searchRoute.GET(new Request("https://shop.example/api/products/search"));
    expect(res.status).toBe(200);
    const { products } = await res.json();
    // Anti-vacuity: a row was returned, so the absence below means something.
    expect(products).toHaveLength(1);
    expect(products[0].slug).toBe("ethiopia-yirgacheffe");
    expect(products[0]).not.toHaveProperty("checkoutEndpoint");
    expect(JSON.stringify(products)).not.toContain("agent-checkout");
  });
});
