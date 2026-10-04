import { NextRequest } from "next/server";
import { GET as homepageMarkdown } from "@/app/llms.txt/route";

// /index.md — URL-suffix fallback for the markdown homepage. Same document
// the Accept-negotiation on "/" serves; the .md URL exists for agents that
// probe suffixes before headers. (The proxy matcher excludes dotted paths,
// so this must be a real route, not a middleware rewrite.)
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = "/llms.txt";
  // Marker der beder llms-routen om homepage-form (frontmatter på).
  url.searchParams.set("md", "1");
  return homepageMarkdown(new NextRequest(url, { headers: request.headers }));
}
