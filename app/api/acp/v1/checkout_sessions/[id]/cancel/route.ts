import { cancelSession } from "@/lib/acp";
import {
  acpDisabledResponse,
  acpExceptionResponse,
  jsonError,
} from "@/lib/acp/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx): Promise<Response> {
  const disabled = acpDisabledResponse();
  if (disabled) return disabled;

  try {
    const { id } = await ctx.params;
    const session = await cancelSession(id);
    if (!session) {
      return jsonError(404, "acp_session_not_found", "ACP checkout session not found.");
    }
    return Response.json(session);
  } catch (error) {
    return acpExceptionResponse(error);
  }
}
