import { z } from "zod";
import { brand } from "@/brand.config";
import { AcpError } from "@/lib/acp";

export function acpDisabledResponse(): Response | null {
  if (brand.acp.enabled) return null;
  return Response.json({ error: "not_found" }, { status: 404 });
}

export function jsonError(
  status: number,
  error: string,
  message: string,
  details?: unknown,
): Response {
  return Response.json(
    {
      error,
      message,
      ...(details ? { details } : {}),
    },
    { status },
  );
}

export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: jsonError(400, "invalid_json", "Request body must be valid JSON."),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError(
        422,
        "validation_error",
        "Request body failed validation.",
        parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

export function acpExceptionResponse(error: unknown): Response {
  if (error instanceof AcpError) {
    return jsonError(error.status, error.code, error.message);
  }
  return jsonError(500, "internal_error", "Internal ACP checkout error.");
}
