import {
  createSession,
  createSessionInputSchema,
} from "@/lib/acp";
import {
  acpDisabledResponse,
  acpExceptionResponse,
  parseJsonBody,
} from "@/lib/acp/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
