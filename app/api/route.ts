import { problemResponse } from "@/lib/api-problem";

// /api itself is not an endpoint — answer in the surface's own error format
// (problem+json) instead of falling through to the HTML 404 page.
export const dynamic = "force-dynamic";

function apiRoot(request: Request): Response {
  const { pathname } = new URL(request.url);
  return problemResponse({
    status: 404,
    title: "Not Found",
    detail: "The API root is not an endpoint.",
    instance: pathname,
    code: "endpoint_not_found",
    resolution:
      "List the available operations at /openapi.json, or start from /llms.txt.",
    headers: {
      Link: '</openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
    },
  });
}

export const GET = apiRoot;
export const POST = apiRoot;
export const HEAD = apiRoot;

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: { Allow: "GET, POST, HEAD, OPTIONS" },
  });
}
