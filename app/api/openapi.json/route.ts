import { buildOpenApiDocument } from "@/lib/openapi";

/**
 * Compatibility alias for clients that only probe an API-prefixed OpenAPI URL.
 * `/openapi.json` remains canonical and is the URL advertised by the RFC 9727
 * API catalog. Both routes are generated from the same tool registry.
 */
export const dynamic = "force-dynamic";

const OPENAPI_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "API-Version": "1.0.0",
  "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
  Link: '</openapi.json>; rel="canonical"',
} as const;

export async function GET() {
  return Response.json(await buildOpenApiDocument(), {
    headers: OPENAPI_HEADERS,
  });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      ...OPENAPI_HEADERS,
      Allow: "GET, HEAD, OPTIONS",
      "Cache-Control": "no-store",
    },
  });
}
