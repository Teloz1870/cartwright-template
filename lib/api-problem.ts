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

const INVOKE_PROBLEMS = {
  403: ["Forbidden", "insufficient_scope", "Use an API key with the required scope."],
  404: ["Not Found", "tool_or_resource_not_found", "Check the tool name or public resource identifier."],
  // A tool's business refusal (lib/tools/refusal.ts): the request clashes with
  // the shop's current state. Retrying it unchanged gets the same answer.
  409: ["Conflict", "tool_refused", "Change the request as the detail describes; retrying it unchanged will be refused again."],
  422: ["Invalid Request", "validation_failed", "Correct the request body using the published JSON Schema."],
  500: ["Tool Execution Failed", "tool_execution_failed", "Retry later or contact the site operator if the error persists."],
} as const;

/**
 * The stable machine code for a failed invocation: a tool refusal's own code
 * (`discount_code_exists`), else the generic code for its status. Shared by
 * REST and MCP so both surfaces name the same failure the same way.
 */
export function invokeErrorCode(result: Exclude<InvokeResult, { ok: true }>): string {
  if ((result.status === 404 || result.status === 409) && result.code) return result.code;
  return INVOKE_PROBLEMS[result.status][1];
}

export function invokeProblem(result: Exclude<InvokeResult, { ok: true }>, instance: string) {
  const [title, , resolution] = INVOKE_PROBLEMS[result.status];
  const code = invokeErrorCode(result);
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
