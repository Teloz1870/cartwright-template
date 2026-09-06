import { cancelSession } from "@/lib/acp";
import {
  acpDisabledResponse,
  acpExceptionResponse,
  jsonError,
} from "@/lib/acp/http";
import { allowResponse } from "@/lib/http/allow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST` is the only exported verb — no `GET`, so no framework `HEAD`. */
const ALLOWED_METHODS = "OPTIONS, POST";

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

/** Same gate as `POST`, and independent of `id` (see the sibling route). */
export function OPTIONS(): Response {
  const disabled = acpDisabledResponse();
  if (disabled) return disabled;
  return allowResponse(ALLOWED_METHODS);
}
