import type { InvokeResult } from "@/lib/tools/registry";

export type ProblemOptions = {
  status: number;
  title: string;
  detail: string;
  instance: string;
  code: string;
  resolution: string;
  issues?: unknown;
  headers?: HeadersInit;
};

export function problemResponse(options: ProblemOptions): Response {
  return Response.json(
    {
      type: `https://cartwright.app/problems/${options.code}`,
      title: options.title,
      status: options.status,
      detail: options.detail,
      instance: options.instance,
      code: options.code,
      resolution: options.resolution,
      ok: false,
      error: options.detail,
      ...(options.issues === undefined ? {} : { issues: options.issues }),
    },
    {
      status: options.status,
      headers: { "Content-Type": "application/problem+json", ...options.headers },
    },
  );
}

/**
 * Keep actionable client errors intact while preventing handler/provider
 * internals from crossing either the REST or MCP boundary.
 */
export function safeInvokeErrorDetail(
  result: Exclude<InvokeResult, { ok: true }>,
): string {
  return result.status === 500
    ? "The tool could not complete because of an internal service error."
    : result.error;
}

export function invokeProblem(result: Exclude<InvokeResult, { ok: true }>, instance: string) {
  const map = {
    403: ["Forbidden", "insufficient_scope", "Use an API key with the required scope."],
    404: ["Not Found", "tool_or_resource_not_found", "Check the tool name or public resource identifier."],
    422: ["Invalid Request", "validation_failed", "Correct the request body using the published JSON Schema."],
    500: ["Tool Execution Failed", "tool_execution_failed", "Retry later or contact the site operator if the error persists."],
  } as const;
  const [title, code, resolution] = map[result.status];
  // Validation/auth errors are intentionally actionable. Handler failures can
  // contain SQL, provider, filesystem or credential details and must remain in
  // server logs rather than crossing the public API boundary.
  const detail = safeInvokeErrorDetail(result);
  return problemResponse({
    status: result.status,
    title,
    detail,
    instance,
    code,
    resolution,
    ...(result.status === 422 ? { issues: result.issues } : {}),
  });
}
