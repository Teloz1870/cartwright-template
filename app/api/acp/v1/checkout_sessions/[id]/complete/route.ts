import { acpDisabledResponse } from "@/lib/acp/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const disabled = acpDisabledResponse();
  if (disabled) return disabled;

  return Response.json(
    {
      error: "acp_checkout_completion_not_enabled",
      message: "ACP checkout completion (payment) ships in Phase B.",
    },
    { status: 501 },
  );
}
