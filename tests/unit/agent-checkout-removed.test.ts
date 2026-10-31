import { existsSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * B84 — /api/commerce/agent-checkout is gone, and nothing advertises it.
 *
 * The route created a Stripe Checkout Session for one product with no order
 * behind it: the webhook skips a session without an `orderId`, so the buyer
 * paid, the shop recorded nothing and the success page was a 404. Every
 * `/api/products/search` row handed agents its address as `checkoutEndpoint`.
 * v0.63.0 made it answer 410 and announced its removal; this release deletes
 * the file, so the `/api` catch-all answers the path like any other unknown
 * API path.
 *
 * Pinned here: the route file and its folder are gone; the catch-all answers
 * the old path with a 404 problem+json for every verb; and the search rows
 * carry no checkout field.
 */

const mocks = vi.hoisted(() => ({
  getBrand: vi.fn(),
  prisma: { product: { findMany: vi.fn() } },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/brand", () => ({ getBrand: mocks.getBrand }));
vi.mock("@/lib/media/shim", () => ({ resolveProductImageUrls: () => [] }));
vi.mock("@/lib/search/semantic", () => ({ hybridRankProducts: vi.fn(async () => null) }));

import * as unknownApi from "@/app/api/[...unknown]/route";
import * as searchRoute from "@/app/api/products/search/route";

const URL_ = "https://shop.example/api/commerce/agent-checkout";
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getBrand.mockResolvedValue({
    storeName: "Test",
    url: "https://shop.example",
    policies: { currency: "DKK" },
  });
});

describe("/api/commerce/agent-checkout is removed", () => {
  it("has no route file and no commerce folder left", () => {
    const root = process.cwd();
    expect(existsSync(path.join(root, "app/api/commerce/agent-checkout/route.ts"))).toBe(false);
    expect(existsSync(path.join(root, "app/api/commerce"))).toBe(false);
    // Anti-vacuity: the paths are resolved against the repo root.
    expect(existsSync(path.join(root, "app/api/products/search/route.ts"))).toBe(true);
  });

  it.each(METHODS)("%s → the /api catch-all's 404 problem+json", async (method) => {
    const withBody = method !== "GET" && method !== "HEAD";
    const res = await unknownApi[method](
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
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toBe("application/problem+json");
    const body = await res.json();
    expect(body).toMatchObject({
      status: 404,
      code: "endpoint_not_found",
      instance: "/api/commerce/agent-checkout",
    });
  });
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
