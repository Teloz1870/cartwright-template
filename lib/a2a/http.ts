/**
 * Master Plan §4 Phase 8 — HTTP helpers for A2A (Agent-to-Agent) endpoints.
 *
 * Companion to lib/acp/http.ts but distinct because A2A has its own feature
 * flag (brand.features.a2a) — defaults to false so the endpoints return 404
 * unless a fork explicitly opts in (typically the agent-marketplace template
 * sets this flag).
 *
 * Pure module — only imports the brand config + zod.
 */

import { z } from "zod";
import { brand } from "@/brand.config";

/**
 * Gate: return 404 unless brand.features.a2a is true. Endpoints call this
 * as their first line, before doing any work.
 *
 * Why 404 instead of 403: a disabled endpoint should be indistinguishable
 * from a non-existent endpoint to outside scanners. Returning 403 leaks
 * the presence of the feature.
 */
export function a2aDisabledResponse(): Response | null {
  // brand.features.a2a may be undefined on older brand.config layouts
  // (the field was added in Phase 4 close-out). Default to false in that case.
  const enabled = Boolean((brand.features as { a2a?: boolean }).a2a);
  if (enabled) return null;
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
      response: jsonError(
        400,
        "invalid_json",
        "Request body must be valid JSON.",
      ),
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

/**
 * Standard Guardian-denied response: 403 with the deny reason. Endpoints
 * call this directly when guardianCheck() returns decision="deny".
 */
export function guardianDeniedResponse(reason: string): Response {
  return jsonError(403, "forbidden", `Agentic call denied: ${reason}`, {
    reason,
  });
}
