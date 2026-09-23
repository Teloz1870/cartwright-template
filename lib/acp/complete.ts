import "server-only";

import { z } from "zod";
import { AcpError, retrieveSession } from "@/lib/acp";
import { getStripeClient } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { createOrderFromAcpSession } from "@/lib/orders/create-acp";

/**
 * Hul C — ACP checkout completion (delegated payment). WIRED.
 *
 * Sidste brik i ACP-session-lifecyclen: create/update/retrieve/cancel findes
 * (lib/acp/index.ts); /complete (betaling) er nu implementeret.
 *
 * Flow: idempotency-replay → hent + validér session → opkræv via Stripe
 * **Shared Payment Token** (off-session, agent-delegeret) → opret ordre fra
 * session-line-items (lib/orders/create-acp.ts) → markér completed. Hele
 * blokken er gated bag env `ACP_PAYMENT_COMPLETION=1` og er **inert som
 * default** — uden flaget svarer endpointet 501 som før.
 *
 * Bygget kode-klar men inert: stien afventer to EKSTERNE forudsætninger der
 * ikke kan skaffes i kode — Stripe SPT-adgang + ChatGPT merchant-onboarding.
 * Se docs/HUL-C-ACP-COMPLETION.md. Når flowet er verificeret end-to-end:
 * promovér env-gaten til en `acpPaymentCompletion`-feature-flag.
 */

export const completeSessionInputSchema = z.object({
  // ACP-spec bruger snake_case. SPT'en delegeres af buyer-agenten.
  shared_payment_token: z.string().trim().min(1),
  idempotency_key: z.string().trim().min(1).optional(),
});

export type CompleteSessionInput = z.infer<typeof completeSessionInputSchema>;

/** Er payment-completion aktiveret? Default OFF (inert). */
export function isAcpCompletionEnabled(): boolean {
  return process.env.ACP_PAYMENT_COMPLETION === "1";
}

/**
 * Det eneste eksternt-afhængige trin: opkræv via en Stripe Shared Payment
 * Token. Afviger bevidst fra lib/stripe.ts:createPaymentIntent (som bruger
 * `automatic_payment_methods` on-session): SPT-flowet er off-session +
 * delegeret — agenten er ikke til stede, så vi `confirm: true` straks og
 * forventer `succeeded` (3DS/requires_action kan ikke løses off-session og
 * behandles som fejl). idempotencyKey dedup'er en retry til samme PaymentIntent.
 */
async function chargeViaSharedPaymentToken(args: {
  sharedPaymentToken: string;
  amountMinor: number;
  currency: string;
  acpSessionId: string;
  idempotencyKey?: string;
}): Promise<{ paymentIntentId: string }> {
  const stripe = await getStripeClient();
  if (!stripe) {
    throw new AcpError(
      "acp_payment_provider_unavailable",
      "Stripe is not configured for this store; cannot complete agentic checkout.",
      503,
    );
  }

  const intent = await stripe.paymentIntents.create(
    {
      amount: args.amountMinor,
      currency: args.currency.toLowerCase(),
      payment_method: args.sharedPaymentToken,
      confirm: true,
      off_session: true,
      metadata: { acpSessionId: args.acpSessionId, source: "agentic_commerce" },
    },
    { idempotencyKey: args.idempotencyKey ?? `acp_${args.acpSessionId}` },
  );

  if (intent.status !== "succeeded") {
    throw new AcpError(
      "acp_payment_failed",
      `Delegated payment did not succeed (status: ${intent.status}).`,
      402,
    );
  }
  return { paymentIntentId: intent.id };
}

/** Best-effort refund hvis ordre-oprettelse fejler EFTER en gennemført charge. */
async function refundAfterFailure(paymentIntentId: string): Promise<void> {
  try {
    const stripe = await getStripeClient();
    if (stripe) await stripe.refunds.create({ payment_intent: paymentIntentId });
  } catch (err) {
    console.error("[acp] refund after failed completion failed", err);
  }
}

/**
 * Fuldfør en ACP-checkout-session: (idempotency) → validér → opkræv (SPT) →
 * opret ordre → returnér completed session + order-reference.
 */
export async function completeAcpSession(
  sessionId: string,
  input: CompleteSessionInput,
): Promise<Record<string, unknown>> {
  if (!isAcpCompletionEnabled()) {
    throw new AcpError(
      "acp_checkout_completion_not_enabled",
      "ACP checkout completion (payment) is not enabled on this store.",
      501,
    );
  }

  // 0) Idempotency-replay: samme idempotency_key → tidligere svar (ingen
  //    dobbelt-charge). Modellen AcpIdempotencyKey er beregnet til netop dette.
  if (input.idempotency_key) {
    const prior = await prisma.acpIdempotencyKey.findUnique({
      where: { key: input.idempotency_key },
    });
    if (prior) return JSON.parse(prior.responseJson) as Record<string, unknown>;
  }

  // 1) Hent + validér session.
  const session = await retrieveSession(sessionId);
  if (!session) {
    throw new AcpError("acp_session_not_found", "ACP checkout session not found.", 404);
  }
  if (session.status !== "ready_for_payment") {
    throw new AcpError(
      "acp_session_not_ready",
      `Session must be 'ready_for_payment' to complete (was '${session.status}').`,
      409,
    );
  }
  if (!session.buyer.email) {
    throw new AcpError(
      "acp_buyer_email_required",
      "A buyer email is required to complete checkout.",
      422,
    );
  }

  // 2) Opkræv via SPT. amount_total er allerede minor-units (øre) i base-
  //    currency (ACP-sessioner oprettes i base-currency).
  const { paymentIntentId } = await chargeViaSharedPaymentToken({
    sharedPaymentToken: input.shared_payment_token,
    amountMinor: session.totals.amount_total,
    currency: session.currency,
    acpSessionId: sessionId,
    idempotencyKey: input.idempotency_key,
  });

  // 3) Opret ordren fra session-line-items. Fejler den EFTER charge →
  //    best-effort refund så vi aldrig opkræver uden en ordre.
  let orderId: string;
  try {
    orderId = await createOrderFromAcpSession({
      sessionId,
      paymentIntentId,
      paymentMethod: "acp_spt",
    });
  } catch (err) {
    await refundAfterFailure(paymentIntentId);
    if (err instanceof AcpError) throw err;
    if (err instanceof Error && err.message.startsWith("OUT_OF_STOCK:")) {
      throw new AcpError(
        "acp_out_of_stock",
        `${err.message.slice("OUT_OF_STOCK:".length)} sold out during completion; payment refunded.`,
        409,
      );
    }
    throw new AcpError(
      "acp_order_creation_failed",
      "Order creation failed after payment; payment refunded.",
      500,
    );
  }

  // 4) Returnér den serialiserede completed session + order-reference.
  const completed = await retrieveSession(sessionId);
  const response: Record<string, unknown> = {
    ...(completed ?? { id: sessionId, status: "completed" }),
    order: { id: orderId, payment_intent_id: paymentIntentId },
  };

  // 5) Persistér idempotency-svaret til replay.
  if (input.idempotency_key) {
    await prisma.acpIdempotencyKey
      .create({
        data: {
          key: input.idempotency_key,
          sessionId,
          responseJson: JSON.stringify(response),
        },
      })
      .catch(() => {
        /* race på samme key — replay-readen ovenfor dækker normalvejen */
      });
  }

  return response;
}
