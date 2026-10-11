import {
  retrieveSession,
  updateSession,
  updateSessionInputSchema,
} from "@/lib/acp";
import {
  acpDisabledResponse,
  acpExceptionResponse,
  jsonError,
  parseJsonBody,
} from "@/lib/acp/http";
import { allowResponse } from "@/lib/http/allow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET` + `POST` are exported; `HEAD` is Next's, filled in from `GET`. */
const ALLOWED_METHODS = "GET, HEAD, OPTIONS, POST";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const disabled = acpDisabledResponse();
  if (disabled) return disabled;

  const { id } = await ctx.params;
  const session = await retrieveSession(id);
  if (!session) {
    return jsonError(404, "acp_session_not_found", "ACP checkout session not found.");
  }
  return Response.json(session);
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const disabled = acpDisabledResponse();
  if (disabled) return disabled;

  const parsed = await parseJsonBody(request, updateSessionInputSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const { id } = await ctx.params;
    const session = await updateSession(id, parsed.data);
    if (!session) {
      return jsonError(404, "acp_session_not_found", "ACP checkout session not found.");
    }
    return Response.json(session);
  } catch (error) {
    return acpExceptionResponse(error);
  }
}

/**
 * Same gate as `GET`/`POST`, and deliberately independent of `id`: the method
 * list belongs to the route, not to a session, so this answers identically for
 * a known and an unknown id and cannot be used to probe which sessions exist.
 */
export function OPTIONS(): Response {
  const disabled = acpDisabledResponse();
  if (disabled) return disabled;
  return allowResponse(ALLOWED_METHODS);
}
