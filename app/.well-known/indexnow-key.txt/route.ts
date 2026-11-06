import { getBrand } from "@/lib/brand";
import { allowResponse } from "@/lib/http/allow";
import { indexNowKey } from "@/lib/indexnow";

/**
 * /.well-known/indexnow-key.txt — the key file IndexNow fetches to verify
 * that a ping really came from this host (`keyLocation` in every POST
 * lib/indexnow.ts sends). Serves the key as text/plain when the runtime flag
 * `indexNow` is on AND `INDEXNOW_KEY` is set; otherwise 404 on every verb,
 * so a shop that does not ping does not advertise a key either. `OPTIONS` is
 * exported behind the same gate because the framework's substitute would not
 * be (see lib/http/allow.ts). The dotted path keeps it outside the locale
 * rewrite (lib/locale-exempt.ts, escape 2).
 */
export const dynamic = "force-dynamic";

const ALLOWED_METHODS = "GET, HEAD, OPTIONS";

async function enabledKey(): Promise<string | null> {
  const key = indexNowKey();
  if (!key) return null;
  const brand = await getBrand();
  return brand.features.indexNow ? key : null;
}

function notFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function GET(): Promise<Response> {
  const key = await enabledKey();
  if (!key) return notFound();
  return new Response(key, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // An admin can flip the flag without a redeploy — never cache the answer.
      "cache-control": "no-store",
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  const key = await enabledKey();
  if (!key) return notFound();
  return allowResponse(ALLOWED_METHODS);
}
