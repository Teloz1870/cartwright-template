/**
 * Master Plan §4 Phase 8 — POST /api/negotiate
 *
 * Buyer agents call this with their counter-offer; the shop responds with
 * the Anchor-and-Resume engine's decision. CRITICAL: this handler MUST NOT
 * import any LLM module — the engine is deterministic per §3.2. The P2K
 * scanner enforces this at CI time.
 *
 * Flow:
 *   1. a2aDisabledResponse() → 404 if A2A flag is off.
 *   2. Parse + validate body (zod).
 *   3. Authenticate caller (API-key Bearer).
 *   4. guardianCheck() → 403 if legislation denies.
 *   5. decideNegotiation() → engine kernel.
 *   6. Return {decision, nextOffer, reasoningCodes}.
 *
 * The handler writes the decision to the AgenticJWT audit row indirectly
 * (guardianCheck does it as part of step 4).
 *
 * No LLM imports. Enforced by tests/unit/negotiation/no-llm-imports.test.ts
 * and scripts/p2k-scan.ts.
 */

import { z } from "zod";
import { authenticateApiKey } from "@/lib/api-auth";
import {
  a2aDisabledResponse,
  guardianDeniedResponse,
  jsonError,
  parseJsonBody,
} from "@/lib/a2a/http";
import { guardianCheck } from "@/lib/guardian/middleware";
import {
  decideNegotiation,
  type NegotiationInput,
} from "@/lib/negotiation/anchor-resume";
import { allowResponse } from "@/lib/http/allow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST` is the only exported verb — no `GET`, so no framework `HEAD`. */
const ALLOWED_METHODS = "OPTIONS, POST";

// ─── Request schema ─────────────────────────────────────────────────────────

const offerSchema = z.object({
  priceMinor: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  validUntil: z.string().datetime(),
});

const negotiateRequestSchema = z.object({
  /** Agentic context (A-JWT id, scopes, etc). */
  agentId: z.string().min(1),
  jti: z.string().min(1),
  signedJwt: z.string().min(1),
  scopes: z.array(z.string()),

  /** Negotiation inputs. */
  floorMinor: z.number().int().nonnegative(),
  anchorMinor: z.number().int().nonnegative(),
  concessionRate: z.number().min(0).max(1),
  currentOffer: offerSchema.nullable(),
  counterOffer: offerSchema.nullable(),
  round: z.number().int().positive(),
  maxRounds: z.number().int().positive(),
});

type NegotiateRequest = z.infer<typeof negotiateRequestSchema>;

function toEngineInput(req: NegotiateRequest): NegotiationInput {
  return {
    floorMinor: req.floorMinor,
    anchorMinor: req.anchorMinor,
    concessionRate: req.concessionRate,
    currentOffer: req.currentOffer
      ? {
          priceMinor: req.currentOffer.priceMinor,
          quantity: req.currentOffer.quantity,
          validUntil: new Date(req.currentOffer.validUntil),
        }
      : null,
    counterOffer: req.counterOffer
      ? {
          priceMinor: req.counterOffer.priceMinor,
          quantity: req.counterOffer.quantity,
          validUntil: new Date(req.counterOffer.validUntil),
        }
      : null,
    round: req.round,
    maxRounds: req.maxRounds,
    now: new Date(),
  };
}

// ─── Handler ────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  const disabled = a2aDisabledResponse();
  if (disabled) return disabled;

  const parsed = await parseJsonBody(request, negotiateRequestSchema);
  if (!parsed.ok) return parsed.response;

  // Bearer-token auth.
  const auth = await authenticateApiKey(request);
  if ("error" in auth) {
    return jsonError(401, "unauthorized", "Invalid or missing bearer token.");
  }

  const body = parsed.data;

  // Guardian: scope + value-cap + rail check + audit row.
  const counterAmount = body.counterOffer?.priceMinor;
  const verdict = await guardianCheck({
    agentId: body.agentId,
    jti: body.jti,
    scopes: body.scopes,
    requiredScope: "negotiate",
    requestPath: "/api/negotiate",
    requestMethod: "POST",
    amountMinor: counterAmount,
    signedJwt: body.signedJwt,
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });
  if (verdict.decision === "deny") {
    return guardianDeniedResponse(verdict.reason);
  }

  // Run the deterministic engine.
  const decision = decideNegotiation(toEngineInput(body));

  return Response.json(
    {
      decision: decision.decision,
      nextOffer: decision.nextOffer
        ? {
            priceMinor: decision.nextOffer.priceMinor,
            quantity: decision.nextOffer.quantity,
            validUntil: decision.nextOffer.validUntil.toISOString(),
          }
        : null,
      reasoningCodes: decision.reasoningCodes,
    },
    { status: 200 },
  );
}

/**
 * Same gate as `POST`. Without this export the framework answered `OPTIONS`
 * itself, so a shop with `brand.features.a2a` false — every default fork —
 * still advertised the negotiation surface here.
 *
 * The flag half of the gate, and only that half: `POST` additionally runs
 * `authenticateApiKey()` and `guardianCheck()`; this deliberately does not.
 * The method list belongs to the resource, not to a caller's token, so a
 * client that had to present a bearer token to learn which verbs exist could
 * not discover anything the flag has not already published.
 */
export function OPTIONS(): Response {
  const disabled = a2aDisabledResponse();
  if (disabled) return disabled;
  return allowResponse(ALLOWED_METHODS);
}
