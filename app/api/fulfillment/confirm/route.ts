import { NextRequest } from "next/server";

import { markFulfillmentShipped } from "@/lib/fulfillment";
import { brand } from "@/brand.config";

/** Leverandør markerer en fulfillment-ordre som afsendt via token-link. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(title: string, message: string): Response {
  const html = `<!doctype html><html lang="da"><head><meta charset="utf-8">
<meta name="robots" content="noindex"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem}</style>
</head><body><h1>${title}</h1><p>${message}</p></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const r = await markFulfillmentShipped(token);
  if (!r.ok) return page("Ugyldigt link", "Vi kunne ikke finde den fulfillment-ordre.");
  return page("Tak — markeret som afsendt", `${brand.storeName} er underrettet.`);
}
