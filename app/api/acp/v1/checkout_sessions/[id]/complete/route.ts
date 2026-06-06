import {
  acpDisabledResponse,
  acpExceptionResponse,
  jsonError,
  parseJsonBody,
} from "@/lib/acp/http";
import {
  completeAcpSession,
  completeSessionInputSchema,
  isAcpCompletionEnabled,
} from "@/lib/acp/complete";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/acp/v1/checkout_sessions/[id]/complete — ACP delegated payment.
 *
 * Hul C SCAFFOLD: gated bag env `ACP_PAYMENT_COMPLETION=1` (default OFF →
 * uændret "not enabled"-svar som før). Når aktiveret validerer den sessionen
 * og når frem til det isolerede Stripe-SPT-opkrævnings-trin, som endnu ikke er
 * wired. Se lib/acp/complete.ts + docs/HUL-C-ACP-COMPLETION.md.
 */
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const disabled = acpDisabledResponse();
  if (disabled) return disabled;

  // Inert som default: uden env-flag svarer vi præcis som det tidligere stub.
  if (!isAcpCompletionEnabled()) {
    return jsonError(
      501,
      "acp_checkout_completion_not_enabled",
      "ACP checkout completion (payment) is not enabled on this store. See docs/HUL-C-ACP-COMPLETION.md.",
    );
  }

  const parsed = await parseJsonBody(request, completeSessionInputSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const { id } = await ctx.params;
    const result = await completeAcpSession(id, parsed.data);
    return Response.json(result);
  } catch (error) {
    return acpExceptionResponse(error);
  }
}
