/**
 * Master Plan §4 Phase 8 — GET /api/agent-card
 *
 * Returns the shop's latest active SignedAgentCard. Buyer agents call this
 * first (discovery step). The returned JSON includes the payload, signature,
 * and the public key — the buyer can verify everything offline.
 *
 * Gated behind brand.features.a2a (default false). On disabled shops the
 * endpoint returns 404 (indistinguishable from non-existent endpoint).
 *
 * If no AgentCard exists in the DB (e.g. shop hasn't been initialised),
 * returns 503 service_unavailable rather than a fake card — buyer agents
 * MUST refuse to negotiate with an un-carded shop.
 */

import { a2aDisabledResponse, jsonError } from "@/lib/a2a/http";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const disabled = a2aDisabledResponse();
  if (disabled) return disabled;

  try {
    // Find the latest active (non-revoked) AgentCard.
    const card = await prisma.agentCard.findFirst({
      where: { revokedAt: null },
      orderBy: { createdAt: "desc" },
    });

    if (!card) {
      return jsonError(
        503,
        "no_agent_card_configured",
        "This shop has not yet published an Agent Card. Contact the shop operator.",
      );
    }

    // The DB stores the signed JSON verbatim — we just need to wrap it with
    // signature + publicKey for the response shape.
    let payload: unknown;
    try {
      payload = JSON.parse(card.signedJson);
    } catch (err) {
      // Should never happen — the card was signed by us. But if it does,
      // serve 500 rather than a malformed response.
      return jsonError(
        500,
        "agent_card_corrupted",
        "Stored Agent Card is not valid JSON. Shop operator must regenerate.",
      );
    }

    return Response.json(
      {
        payload,
        signature: card.signature,
        publicKey: card.publicKey,
        _meta: {
          version: card.version,
          signedAt: card.signedAt.toISOString(),
          expiresAt: card.expiresAt?.toISOString() ?? null,
        },
      },
      {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=300", // 5 min — short enough that rotations propagate
          "access-control-allow-origin": "*", // public metadata; safe for cross-origin discovery
        },
      },
    );
  } catch (err) {
    console.error("[api/agent-card]", err);
    return jsonError(500, "internal_error", "Failed to load Agent Card.");
  }
}
