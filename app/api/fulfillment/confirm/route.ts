import { NextRequest } from "next/server";

import { findFulfillmentByToken, markFulfillmentShipped } from "@/lib/fulfillment";
import { brand } from "@/brand.config";

/**
 * Leverandør markerer en fulfillment-ordre som afsendt via token-link.
 *
 * GET (and the HEAD Next derives from it) only shows a page with a button; POST
 * does the write. Mail scanners open links, so a GET that wrote would mark goods
 * shipped with no person involved.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Outside `app/[locale]`, so the shop's `defaultLocale` is the only signal.
 * Danish is the special case; every other locale gets English. Keep this in
 * step with the packing-slip email in `lib/fulfillment.ts` — a supplier who
 * gets a Danish email and lands on an English page is worse than either.
 */
// `brand.defaultLocale` is a literal type, not `string` — this file compiles
// against whatever the shop configured. On the engine that is "da", in a
// scaffold it is "en", so a bare `=== "da"` is a type error in exactly the
// places it is not a type error here. Widened deliberately: the value is a
// runtime locale, and the narrow literal is an artefact of the config being a
// literal object.
const da = (brand.defaultLocale as string) === "da";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="${brand.defaultLocale}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem}
button{width:100%;min-height:3.5rem;font:inherit;font-weight:600;color:#fff;background:#111;border:0;border-radius:.5rem;cursor:pointer}
button:focus-visible{outline:3px solid #111;outline-offset:3px}</style>
</head><body><h1>${title}</h1>${body}</body></html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // The URL carries the token; a link on this page must not pass it on.
      "Referrer-Policy": "no-referrer",
    },
  });
}

function invalidPage(): Response {
  return page(
    da ? "Ugyldigt link" : "Invalid link",
    `<p>${da ? "Vi kunne ikke finde den fulfillment-ordre." : "We could not find that fulfilment order."}</p>`,
    404,
  );
}

function alreadyShippedPage(orderId: string): Response {
  const ref = escapeHtml(orderId.slice(0, 8));
  return page(
    da ? "Allerede markeret som afsendt" : "Already marked as shipped",
    `<p>${da ? `Ordre ${ref} er allerede markeret som afsendt. Du kan lukke siden.` : `Order ${ref} is already marked as shipped. You can close this page.`}</p>`,
  );
}

export async function GET(request: NextRequest) {
  const fo = await findFulfillmentByToken(request.nextUrl.searchParams.get("token") ?? "");
  if (!fo) return invalidPage();
  if (fo.status === "shipped") return alreadyShippedPage(fo.orderId);
  const ref = escapeHtml(fo.orderId.slice(0, 8));
  // No `action`: the form posts to the address it was opened on, so it also holds
  // on a shop with `urls.trailingSlash` set.
  return page(
    da ? `Er ordre ${ref} afsendt?` : `Has order ${ref} shipped?`,
    `<p>${da ? "Tryk kun, når varerne er sendt af sted til kunden." : "Press only when the goods have left for the customer."}</p>
<form method="post"><input type="hidden" name="token" value="${escapeHtml(fo.token)}"><button type="submit">${da ? "Markér som afsendt" : "Mark as shipped"}</button></form>`,
  );
}

export async function POST(request: NextRequest) {
  // A body that is not a form has no token to read: same answer as a wrong one.
  const form = await request.formData().catch(() => null);
  const token = form?.get("token");
  const r = await markFulfillmentShipped(typeof token === "string" ? token : "");
  if (!r.ok) return invalidPage();
  if (r.alreadyShipped) return alreadyShippedPage(r.orderId);
  const ref = escapeHtml(r.orderId.slice(0, 8));
  return page(
    da ? "Tak — markeret som afsendt" : "Thanks — marked as shipped",
    `<p>${da ? `Ordre ${ref} er markeret som afsendt. Du kan lukke siden.` : `Order ${ref} is marked as shipped. You can close this page.`}</p>`,
  );
}
