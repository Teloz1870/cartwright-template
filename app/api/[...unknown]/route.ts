import { problemResponse } from "@/lib/api-problem";

// Catch-all for every /api/* path no concrete route claims. Without it,
// unknown API paths fall through to the HTML 404 page — an agent probing
// /api or /api/v1 gets text/html where every documented error on this
// surface is RFC 9457 problem+json. Static segments always win over this
// dynamic segment, so real endpoints are never shadowed.
export const dynamic = "force-dynamic";

function unknownApiPath(request: Request): Response {
  const { pathname } = new URL(request.url);
  return problemResponse({
    status: 404,
    title: "Not Found",
    detail: `No API endpoint exists at ${pathname}.`,
    instance: pathname,
    code: "endpoint_not_found",
    resolution:
      "List the available operations at /openapi.json, or start from /llms.txt.",
    headers: {
      Link: '</openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
    },
  });
}

export const GET = unknownApiPath;
export const POST = unknownApiPath;
export const PUT = unknownApiPath;
export const PATCH = unknownApiPath;
export const DELETE = unknownApiPath;
export const HEAD = unknownApiPath;

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: { Allow: "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS" },
  });
}
