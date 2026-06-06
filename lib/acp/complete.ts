import "server-only";

import { z } from "zod";
import { AcpError, retrieveSession } from "@/lib/acp";

/**
 * Hul C (SCAFFOLD) — ACP checkout completion (delegated payment).
 *
 * Dette er den ENESTE manglende brik i ACP-session-lifecyclen: create/update/
 * retrieve/cancel findes (lib/acp/index.ts); kun /complete (betaling) mangler.
 *
 * Status: SCAFFOLD bag env-gate `ACP_PAYMENT_COMPLETION=1`. De verificerbare
 * dele (retrieve + status-validering) er ægte og testede. Det eneste eksternt-
 * afhængige trin — at opkræve via en Stripe **Shared Payment Token** — er
 * isoleret i chargeViaSharedPaymentToken() og kaster en tydelig fejl indtil
 * det wires. Se docs/HUL-C-ACP-COMPLETION.md for færdiggørelses-checklisten +
 * de eksterne forudsætninger (Stripe SPT-adgang + ChatGPT merchant-onboarding).
 *
 * VIGTIGT: createOrder() i lib/orders/create.ts læser CART (session-cookie),
 * ikke en ACP-session — så completion skal bygge ordren fra session.lineItems
 * (se outline i completeAcpSession). Det er bevidst ikke implementeret her, da
 * det ikke kan testes end-to-end uden SPT-flowet.
 */

export const completeSessionInputSchema = z.object({
  // ACP-spec bruger snake_case. SPT'en delegeres af buyer-agenten.
  shared_payment_token: z.string().trim().min(1),
  idempotency_key: z.string().trim().min(1).optional(),
});

export type CompleteSessionInput = z.infer<typeof completeSessionInputSchema>;

/** Er payment-completion-scaffold'en aktiveret? Default OFF (inert). */
export function isAcpCompletionEnabled(): boolean {
  return process.env.ACP_PAYMENT_COMPLETION === "1";
}

/**
 * Det eneste eksternt-afhængige trin: opkræv via en Stripe Shared Payment Token.
 * Kræver Stripe SPT-adgang (delegated payment). Indtil wired → tydelig fejl.
 *
 * Når det wires (se docs): opret en PaymentIntent med SPT som payment_method +
 * confirm:true (off-session, agent-delegeret), amount = session.totalDkk i
 * session.currency, idempotency_key fra requestet. Returnér paymentIntentId.
 */
async function chargeViaSharedPaymentToken(_args: {
  sharedPaymentToken: string;
  amountMinor: number;
  currency: string;
  idempotencyKey?: string;
}): Promise<{ paymentIntentId: string }> {
  throw new AcpError(
    "payment_not_wired",
    "Stripe Shared Payment Token charge is not yet wired. " +
      "Requires Stripe SPT access — see docs/HUL-C-ACP-COMPLETION.md.",
    501,
  );
}

/**
 * Fuldfør en ACP-checkout-session: validér → opkræv (SPT) → opret ordre →
 * markér completed. De første to trin er ægte; resten er outline bag den
 * eksterne SPT-gate.
 */
export async function completeAcpSession(
  sessionId: string,
  input: CompleteSessionInput,
): Promise<never | Record<string, unknown>> {
  if (!isAcpCompletionEnabled()) {
    throw new AcpError(
      "acp_checkout_completion_not_enabled",
      "ACP checkout completion (payment) is not enabled on this store.",
      501,
    );
  }

  // 1) Hent + validér session (ægte).
  const session = await retrieveSession(sessionId);
  if (!session) {
    throw new AcpError("acp_session_not_found", "ACP checkout session not found.", 404);
  }
  const status = (session as { status?: string }).status;
  if (status !== "ready_for_payment") {
    throw new AcpError(
      "acp_session_not_ready",
      `Session must be 'ready_for_payment' to complete (was '${status ?? "unknown"}').`,
      409,
    );
  }

  // 2) Opkræv via SPT (isoleret eksternt trin — kaster indtil wired).
  const totalDkk = Number((session as { totalDkk?: number }).totalDkk ?? 0);
  const currency = String((session as { currency?: string }).currency ?? "dkk");
  await chargeViaSharedPaymentToken({
    sharedPaymentToken: input.shared_payment_token,
    amountMinor: totalDkk, // totalDkk er allerede minor-units (øre) i AcpCheckoutSession
    currency,
    idempotencyKey: input.idempotency_key,
  });

  // 3) TODO (når SPT er wired): opret Order fra session.lineItems (IKKE cart —
  //    createOrder læser cart), persistér betaling, og markér sessionen
  //    completed + sæt orderId. Returnér den serialiserede, completede session.
  //    Se docs/HUL-C-ACP-COMPLETION.md for de præcise trin + helpers.
  throw new AcpError(
    "payment_not_wired",
    "Order creation from ACP session line items is not yet wired (post-SPT step).",
    501,
  );
}
