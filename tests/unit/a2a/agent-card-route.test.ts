import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Moat regression — GET /api/agent-card (the A2A discovery entry point).
 *
 * Buyer agents call this endpoint FIRST to fetch a shop's signed Agent Card
 * before negotiating (Master Plan §4 Phase 8). The route has four distinct
 * paths, none of which were unit-tested (the sibling `agent-card.test.ts`
 * covers only the signing LIB, not the route handler):
 *
 *   1. 404  — `brand.features.a2a` off ⇒ indistinguishable from a non-existent
 *             endpoint. This is the moat invariant: no A2A discovery leaks
 *             unless a fork explicitly opts in (default-false ⇒ every canary
 *             returns 404, and the DB is never touched).
 *   2. 503  — enabled but no active card in the DB ⇒ refuse rather than serve
 *             a fake card (buyer agents MUST NOT negotiate with an un-carded shop).
 *   3. 500  — a stored card whose signedJson is unparseable ⇒ fail loud, never
 *             emit a malformed card.
 *   4. 200  — the happy path: wrap the verbatim signed blob with signature +
 *             publicKey + _meta and set the public-discovery cache/CORS headers.
 *
 * The route reads the flag through the REAL `a2aDisabledResponse()` /
 * `jsonError()` (only `@/brand.config` + `@/lib/db` are mocked — the #347
 * route-handler pattern), so the assertions pin the actual wiring.
 */

const mocks = vi.hoisted(() => ({
  features: { a2a: false } as { a2a?: boolean },
  findFirst: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/brand.config", () => ({
  brand: {
    features: mocks.features,
    storeName: "Example Shop",
    url: "https://shop.example",
    metadata: { description: "An example shop" },
  },
}));
vi.mock("@/lib/db", () => ({
  prisma: { agentCard: { findFirst: mocks.findFirst } },
}));

import { GET } from "@/app/api/agent-card/route";

/** A valid, active AgentCard row (the shape prisma.agentCard.findFirst returns). */
function makeCard(over: Partial<Record<string, unknown>> = {}) {
  const payload = {
    version: 1,
    shopId: "shop.example",
    shopName: "Example Shop",
    capabilities: [],
    paymentRails: ["stripe"],
  };
  return {
    id: "card_1",
    version: 3,
    signedJson: JSON.stringify(payload),
    signature: "c2ln", // base64
    publicKey: "cHVi", // base64
    signedAt: new Date("2026-05-24T20:00:00.000Z"),
    expiresAt: new Date("2026-11-24T20:00:00.000Z"),
    revokedAt: null,
    createdAt: new Date("2026-05-24T20:00:00.000Z"),
    updatedAt: new Date("2026-05-24T20:00:00.000Z"),
    ...over,
  };
}

beforeEach(() => {
  mocks.features.a2a = false;
  mocks.findFirst.mockReset();
});

describe("GET /api/agent-card — feature gate (moat invariant)", () => {
  it("returns 404 when brand.features.a2a is off, without touching the DB", async () => {
    mocks.features.a2a = false;

    const res = await GET();

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    // The gate MUST short-circuit before any DB access — a disabled endpoint
    // is indistinguishable from a non-existent one and leaks nothing.
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when the a2a flag is entirely absent (older brand layout)", async () => {
    delete mocks.features.a2a;

    const res = await GET();

    expect(res.status).toBe(404);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});

describe("GET /api/agent-card — enabled shop", () => {
  beforeEach(() => {
    mocks.features.a2a = true;
  });

  it("queries the latest active (non-revoked) card, newest first", async () => {
    mocks.findFirst.mockResolvedValue(makeCard());

    await GET();

    expect(mocks.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
  });

  it("returns 503 (not a fake card) when no active card exists", async () => {
    mocks.findFirst.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "no_agent_card_configured" });
  });

  it("returns 500 when the stored card's signedJson is not valid JSON", async () => {
    mocks.findFirst.mockResolvedValue(makeCard({ signedJson: "{not valid json" }));

    const res = await GET();

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "agent_card_corrupted" });
  });

  it("returns 500 when the DB query throws", async () => {
    mocks.findFirst.mockRejectedValue(new Error("db down"));

    const res = await GET();

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "internal_error" });
  });

  it("returns 200 with the wrapped signed card + discovery headers on the happy path", async () => {
    mocks.findFirst.mockResolvedValue(makeCard());

    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    // Public metadata: short cache so key rotations propagate, open CORS so any
    // buyer agent can discover cross-origin.
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");

    const body = await res.json();
    // The signed blob is served VERBATIM as a parsed object (not re-stringified).
    expect(body.payload).toEqual({
      version: 1,
      shopId: "shop.example",
      shopName: "Example Shop",
      capabilities: [],
      paymentRails: ["stripe"],
    });
    expect(body.signature).toBe("c2ln");
    expect(body.publicKey).toBe("cHVi");
    expect(body._meta).toEqual({
      version: 3,
      signedAt: "2026-05-24T20:00:00.000Z",
      expiresAt: "2026-11-24T20:00:00.000Z",
    });
    // Top-level A2A identity fields: generic clients and scanners read
    // name/description/version without unwrapping the signed envelope.
    // `name` mirrors the SIGNED payload's shopName (not a second identity).
    // Deliberately NO top-level `url`: a conforming A2A client treats that
    // field as the JSON-RPC service endpoint, and this card's protocol is
    // the signed custom payload — advertising a URL would misdirect it.
    expect(body.name).toBe("Example Shop");
    expect(body.description).toBe("An example shop");
    expect(body.version).toBe("3");
    expect("url" in body).toBe(false);
  });

  it("falls back to the config storeName when the payload lacks shopName", async () => {
    mocks.findFirst.mockResolvedValue(
      makeCard({ signedJson: JSON.stringify({ version: 1 }) }),
    );

    const res = await GET();

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.name).toBe("Example Shop");
  });

  it("serialises a null expiresAt as null in _meta (no-expiry card)", async () => {
    mocks.findFirst.mockResolvedValue(makeCard({ expiresAt: null }));

    const res = await GET();

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body._meta.expiresAt).toBeNull();
  });
});
