import { NextRequest } from "next/server";

import { unsubscribe } from "@/lib/newsletter";
import { brand } from "@/brand.config";

/** Afmeld via token-link (fra newsletter-mails). GET ?token=. Returnerer en lille side. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(title: string, message: string): Response {
  const html = `<!doctype html><html lang="da"><head><meta charset="utf-8">
<meta name="robots" content="noindex"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#1a1a1a}</style>
</head><body><h1>${title}</h1><p>${message}</p>
<p><a href="${brand.url}">← ${brand.storeName}</a></p></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const result = await unsubscribe(token);
  if (!result.ok) {
    return page("Linket er ugyldigt", "Vi kunne ikke finde din tilmelding. Måske er du allerede afmeldt.");
  }
  return page("Du er afmeldt", `${result.email} modtager ikke flere nyhedsbreve. Du kan altid tilmelde dig igen.`);
}
