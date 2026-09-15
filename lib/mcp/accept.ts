import "server-only";

/**
 * Postel-lenient `Accept` for POST JSON-RPC on the MCP endpoint.
 *
 * The Streamable HTTP spec tells CLIENTS to send BOTH `application/json` and
 * `text/event-stream`, and the SDK transport enforces the pair with a 406.
 * Real-world simple clients — and at least one public scanner (measured
 * 2026-08-24: `application/json` alone and the bare wildcard both earned 406, and the
 * scan called the handshake failed) — send only the JSON half, a wildcard,
 * or nothing. For a POST whose response is JSON either way, rejecting on the
 * missing SSE half serves nobody.
 *
 * We widen ONLY the shapes that already say (or imply) JSON is fine:
 * absent header, the bare wildcard, or a list containing `application/json`. A client
 * that explicitly asks for something else entirely (`text/html`) still gets
 * the transport's own 406 — this is leniency, not indifference.
 */
export function withLenientMcpAccept(request: Request): Request {
  if (request.method !== "POST") return request;
  const raw = request.headers.get("accept")?.trim() ?? "";
  const values = raw
    .split(",")
    .map((value) => value.trim().split(";")[0])
    .filter(Boolean);
  const impliesJson =
    values.length === 0 ||
    values.includes("application/json") ||
    values.includes("*/*") ||
    values.includes("application/*");
  const hasSse = values.includes("text/event-stream");
  if (!impliesJson || hasSse) return request;
  const headers = new Headers(request.headers);
  headers.set("accept", "application/json, text/event-stream");
  return new Request(request, { headers });
}
