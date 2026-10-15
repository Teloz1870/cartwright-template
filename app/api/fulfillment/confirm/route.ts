import { NextRequest } from "next/server";

import { markFulfillmentShipped } from "@/lib/fulfillment";
import { brand } from "@/brand.config";

/** Leverandør markerer en fulfillment-ordre som afsendt via token-link. */
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

function page(title: string, message: string): Response {
  const html = `<!doctype html><html lang="${brand.defaultLocale}"><head><meta charset="utf-8">
<meta name="robots" content="noindex"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem}</style>
</head><body><h1>${title}</h1><p>${message}</p></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const r = await markFulfillmentShipped(token);
  if (!r.ok)
    return page(
      da ? "Ugyldigt link" : "Invalid link",
      da
        ? "Vi kunne ikke finde den fulfillment-ordre."
        : "We could not find that fulfilment order.",
    );
  return page(
    da ? "Tak — markeret som afsendt" : "Thanks — marked as shipped",
    da ? `${brand.storeName} er underrettet.` : `${brand.storeName} has been notified.`,
  );
}
