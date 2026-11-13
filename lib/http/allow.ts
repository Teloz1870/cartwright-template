/**
 * The answer to a plain HTTP `OPTIONS` request: `204` plus an `Allow` header
 * naming the verbs the route handles — and nothing else.
 *
 * It exists because that answer has to be written by hand on every gated
 * route. Next installs its own `OPTIONS` handler for any route module that
 * does not export one, and that substitute is framework code: it never reaches
 * the route's own gate. The effect measured on a website-mode production build
 * was a disabled endpoint replying `404` to `GET` while still handing out
 * `204 Allow: GET, HEAD, OPTIONS` to anyone who asked — both halves of a tell,
 * since an absent path answers `404` to `OPTIONS` too. Exporting the verb puts
 * it behind the same gate; this helper is the body of that export, in one
 * place so every gated route answers with the same shape.
 *
 * `HEAD` belongs in the string whenever the module exports `GET` and not
 * `HEAD`: Next fills that verb in from `GET`, so the route really does serve
 * it (through the gate), and leaving it out would advertise less than the
 * resource supports.
 *
 * Deliberately NOT a CORS preflight response: none of the callers send
 * `Access-Control-Allow-*` headers and a browser preflight against them is
 * still meant to fail. `/api/mcp` adds `Vary: Origin` and `Cache-Control:
 * no-store` on top of this shape because its reply depends on the caller's
 * `Origin` — it runs an origin guard. The routes using this helper have no
 * origin guard, so neither header would be stating anything true about them.
 *
 * What this does NOT close, stated rather than implied: a verb no handler
 * implements still gets the framework's `405`, and that is its own "something
 * is mounted here" tell, since an absent path answers `404`. Measured on a
 * production build of this branch: `PUT /api/acp/feed` → `405` with NO `Allow`
 * header (so the method list does not leak that way), `PUT
 * /api/absent-path-xyz` → `404`. Closing that gap means exporting every verb
 * through each gate, or gating in the proxy — a decision, not a mechanical
 * sweep, so it is left open rather than half-done here.
 */
export function allowResponse(allow: string): Response {
  return new Response(null, { status: 204, headers: { allow } });
}
