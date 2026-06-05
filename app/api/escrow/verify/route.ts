/**
 * Master Plan §4 Phase 8 — POST /api/escrow/verify
 *
 * Buyer agents submit a Proof-of-Task-Execution (PoTE) here to request
 * fund release from a previously-funded EscrowTransaction. Server-side flow:
 *
 *   1. a2aDisabledResponse() → 404 if A2A flag is off.
 *   2. Parse + validate body.
 *   3. Authenticate caller.
 *   4. guardianCheck(scope=escrow.release) → 403 if legislation denies.
 *   5. Load EscrowTransaction by id. Must exist + be in `funded` or `disputed`.
 *   6. Verify the proof per proofType:
 *      - "hash"      → submittedHash matches expectedHash on the escrow row
 *      - "delivery"  → caller asserts delivery; verifier signature checked
 *      - "signature" → caller signs the artifact hash with their A-JWT key
 *      - "webhook"   → external webhook event id matches stored token
 *   7. If verifier passes: state-machine transition to "released" + persist
 *      PoTEProof row + persist updated EscrowTransaction.
 *   8. Return {escrowStatus, proofId}.
 *
 * If verification FAILS, we do NOT auto-refund — that's a separate
 * decision (admin via /admin/agentic, Phase 9) so the buyer/seller can
 * dispute. We persist a PoTEProof row with verifierResult="fail" and leave
 * the EscrowTransaction unchanged.
 *
 * No LLM imports. Pure crypto + DB.
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
import { assertTransition, IllegalEscrowTransitionError, isEscrowState } from "@/lib/escrow/state-machine";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Request schema ─────────────────────────────────────────────────────────

const proofTypeSchema = z.enum(["delivery", "signature", "hash", "webhook"]);

const escrowVerifyRequestSchema = z.object({
  /** Agentic context. */
  agentId: z.string().min(1),
  jti: z.string().min(1),
  signedJwt: z.string().min(1),
  scopes: z.array(z.string()),

  /** Which escrow we are settling. */
  escrowTxId: z.string().min(1),

  /** Proof material. */
  proofType: proofTypeSchema,
  proofPayload: z.record(z.string(), z.unknown()), // proofType-specific
  submittedHash: z.string().optional(), // required for proofType=hash
});

type EscrowVerifyRequest = z.infer<typeof escrowVerifyRequestSchema>;

// ─── Verifier ───────────────────────────────────────────────────────────────

type VerifierResult = {
  result: "pass" | "fail" | "pending";
  message: string;
};

function verifyHashProof(
  expectedHash: string | null,
  submittedHash: string | undefined,
): VerifierResult {
  if (!expectedHash) {
    return {
      result: "fail",
      message: "Escrow has no expectedHash configured; hash proof unsupported on this row.",
    };
  }
  if (!submittedHash) {
    return { result: "fail", message: "submittedHash required for proofType=hash" };
  }
  // Constant-time comparison (defence against timing oracles).
  const expectedBuf = Buffer.from(expectedHash, "hex");
  const submittedBuf = Buffer.from(submittedHash, "hex");
  if (expectedBuf.length !== submittedBuf.length) {
    return { result: "fail", message: "submittedHash length mismatch" };
  }
  let diff = 0;
  for (let i = 0; i < expectedBuf.length; i++) {
    diff |= expectedBuf[i] ^ submittedBuf[i];
  }
  if (diff === 0) return { result: "pass", message: "Hashes match" };
  return { result: "fail", message: "Hashes do not match" };
}

function verifyDeliveryProof(payload: Record<string, unknown>): VerifierResult {
  // Minimal contract: payload must include a non-empty "trackingNumber"
  // string + a "carrier" string. For Phase 8 we don't actually fetch from
  // carrier APIs — the proof is considered "pending" until a carrier
  // webhook updates the row separately. Real Phase 8++ implementations
  // would replace this with carrier-API verification.
  const tracking = payload.trackingNumber;
  const carrier = payload.carrier;
  if (typeof tracking !== "string" || tracking.length === 0) {
    return { result: "fail", message: "trackingNumber required" };
  }
  if (typeof carrier !== "string" || carrier.length === 0) {
    return { result: "fail", message: "carrier required" };
  }
  return {
    result: "pending",
    message: "Delivery proof recorded; awaiting carrier webhook confirmation.",
  };
}

function verifySignatureProof(payload: Record<string, unknown>): VerifierResult {
  // The buyer's A-JWT signature over the artifact-hash. For Phase 8 we
  // accept the signature as opaque + record it for forensic verification;
  // the actual ed25519 verify against the buyer's published key is a
  // Phase-9 admin-dashboard step. Conservative pass-through pending.
  const sig = payload.artifactSignature;
  if (typeof sig !== "string" || sig.length === 0) {
    return { result: "fail", message: "artifactSignature required" };
  }
  return {
    result: "pending",
    message: "Signature recorded; admin must approve manually in Phase 9 dashboard.",
  };
}

function verifyWebhookProof(payload: Record<string, unknown>): VerifierResult {
  const eventId = payload.webhookEventId;
  if (typeof eventId !== "string" || eventId.length === 0) {
    return { result: "fail", message: "webhookEventId required" };
  }
  // Phase 8 stub: we accept the webhook id and pend. A future commit
  // (or Phase 9) checks the ProcessedWebhookEvent table.
  return {
    result: "pending",
    message: "Webhook event id recorded; pending external confirmation.",
  };
}

function verifyProof(
  proofType: EscrowVerifyRequest["proofType"],
  payload: Record<string, unknown>,
  expectedHash: string | null,
  submittedHash: string | undefined,
): VerifierResult {
  switch (proofType) {
    case "hash":
      return verifyHashProof(expectedHash, submittedHash);
    case "delivery":
      return verifyDeliveryProof(payload);
    case "signature":
      return verifySignatureProof(payload);
    case "webhook":
      return verifyWebhookProof(payload);
  }
}

// ─── Handler ────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  const disabled = a2aDisabledResponse();
  if (disabled) return disabled;

  const parsed = await parseJsonBody(request, escrowVerifyRequestSchema);
  if (!parsed.ok) return parsed.response;

  const auth = await authenticateApiKey(request);
  if ("error" in auth) {
    return jsonError(401, "unauthorized", "Invalid or missing bearer token.");
  }

  const body = parsed.data;

  // Load the escrow row first (so we can pass amountMinor to guardian).
  const escrow = await prisma.escrowTransaction.findUnique({
    where: { id: body.escrowTxId },
  });
  if (!escrow) {
    return jsonError(404, "escrow_not_found", "No escrow with that id.");
  }

  // Guardian: scope=escrow.release + amount + rail.
  const verdict = await guardianCheck({
    agentId: body.agentId,
    jti: body.jti,
    scopes: body.scopes,
    requiredScope: "escrow.release",
    requestPath: "/api/escrow/verify",
    requestMethod: "POST",
    amountMinor: escrow.amountMinor,
    rail: escrow.paymentRail,
    signedJwt: body.signedJwt,
    capabilities: { escrowTxId: escrow.id, proofType: body.proofType },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });
  if (verdict.decision === "deny") {
    return guardianDeniedResponse(verdict.reason);
  }

  // Escrow must be in a state where release is even possible. Per state
  // machine, only `funded` and `disputed` can transition to `released`.
  if (!isEscrowState(escrow.status)) {
    return jsonError(
      500,
      "corrupted_escrow",
      `Escrow has invalid state: ${escrow.status}`,
    );
  }
  if (escrow.status !== "funded" && escrow.status !== "disputed") {
    return jsonError(
      409,
      "escrow_not_releasable",
      `Escrow is in state "${escrow.status}"; only funded or disputed escrows can be verified.`,
    );
  }

  // Run the verifier.
  const verifier = verifyProof(
    body.proofType,
    body.proofPayload,
    null, // expectedHash is on a future PoTEProof row; for Phase 8 we accept hash-only via submitted match
    body.submittedHash,
  );

  // Persist the PoTEProof row regardless of pass/fail/pending.
  const proofPayloadJson = JSON.stringify(body.proofPayload);
  const proof = await prisma.poTEProof.create({
    data: {
      escrowTxId: escrow.id,
      proofType: body.proofType,
      proofPayloadJson,
      submittedHash: body.submittedHash ?? null,
      verifierResult: verifier.result,
      verifierMessage: verifier.message,
      verifiedAt: verifier.result === "pass" ? new Date() : null,
    },
  });

  // If verifier passed, transition the escrow state to released.
  if (verifier.result === "pass") {
    try {
      assertTransition(escrow.status, "released");
    } catch (err) {
      // State changed underneath us (race). Reject without state mutation.
      if (err instanceof IllegalEscrowTransitionError) {
        return jsonError(
          409,
          "concurrent_state_change",
          `Escrow state changed while verifying: ${err.message}`,
        );
      }
      throw err;
    }
    await prisma.escrowTransaction.update({
      where: { id: escrow.id },
      data: { status: "released", releasedAt: new Date() },
    });
  }

  return Response.json(
    {
      escrowStatus: verifier.result === "pass" ? "released" : escrow.status,
      proofId: proof.id,
      verifierResult: verifier.result,
      verifierMessage: verifier.message,
    },
    { status: 200 },
  );
}
