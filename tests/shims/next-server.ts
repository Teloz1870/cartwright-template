// Shim for `next/server` i Vitest. Tests indlæser ikke faktiske Next.js
// Edge-funktioner — vi giver bare nok overflade til at next-auth-modulet
// kan importeres uden at kaste under registry/customer-tool tests.
export class NextRequest extends Request {}
export class NextResponse extends Response {
  static json(body: unknown, init?: ResponseInit) {
    return Response.json(body, init);
  }
  static redirect(url: string | URL, status?: number) {
    return Response.redirect(url, status);
  }
  static next() {
    return new Response(null);
  }
  static rewrite(url: string | URL) {
    return Response.redirect(url);
  }
}
export const userAgent = () => ({ ua: "" });
export const userAgentFromString = () => ({ ua: "" });
// `after` (post-response work, Next 15.1+): i tests findes der intet
// request-scope — kør callbacken med det samme og slug fejl, præcis som
// produktions-fallbacket i lib/registry-stats.ts gør uden for et request.
export function after(task: (() => unknown | Promise<unknown>) | Promise<unknown>): void {
  if (typeof task === "function") {
    void Promise.resolve()
      .then(() => task())
      .catch(() => {});
  }
}
