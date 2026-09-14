import {
  createSession,
  createSessionInputSchema,
} from "@/lib/acp";
import {
  acpDisabledResponse,
  acpExceptionResponse,
  parseJsonBody,
} from "@/lib/acp/http";
import { allowResponse } from "@/lib/http/allow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST` is the only exported verb — no `GET`, so no framework `HEAD`. */
const ALLOWED_METHODS = "OPTIONS, POST";

export async function POST(request: Request): Promise<Response> {
  const disabled = acpDisabledResponse();
  if (disabled) return disabled;

  const parsed = await parseJsonBody(request, createSessionInputSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const session = await createSession(parsed.data);
    return Response.json(session, { status: 201 });
  } catch (error) {
    return acpExceptionResponse(error);
  }
}

/**
 * Same gate as `POST`. Without this export the framework answered `OPTIONS`
 * itself, so a store with `brand.acp.enabled` false — every default and
 * website-mode fork — still advertised the ACP checkout surface here.
 */
export function OPTIONS(): Response {
  const disabled = acpDisabledResponse();
  if (disabled) return disabled;
  return allowResponse(ALLOWED_METHODS);
}
