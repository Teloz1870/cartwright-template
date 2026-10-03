import { getClient, revokeToken } from "@/lib/ucp/oauth";
import { ucpDisabledResponse, ucpIdentityLinkingEnabled } from "@/lib/ucp/gate";
import { allowResponse } from "@/lib/http/allow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST` is the only exported verb — no `GET`, so no framework `HEAD`. */
const ALLOWED_METHODS = "OPTIONS, POST";

/**
 * RFC 7009 — Token Revocation. Revoke af en refresh cascader til dens access-
 * tokens. Svarer altid 200 (også for ukendte tokens) per RFC. Gated bag
 * ucpIdentityLinking.
 */
export async function POST(req: Request): Promise<Response> {
  if (!(await ucpIdentityLinkingEnabled())) return ucpDisabledResponse();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response(null, { status: 200 });
  }
  const token = form.get("token");
  const clientId = form.get("client_id");

  // revokeToken er bundet til clientId (row.clientId === clientId), så én klient
  // ikke kan revokere en andens tokens. Svarer altid 200 (RFC 7009 lækker ikke
  // token-eksistens), uanset om noget faktisk blev revokeret.
  if (typeof clientId === "string" && typeof token === "string" && token) {
    const client = await getClient(clientId);
    if (client) {
      await revokeToken(token, clientId);
    }
  }
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}

/**
 * Same gate as the handler above: a shop that does not link identities must
 * answer this verb the way an absent path does, rather than let the
 * framework's substitute advertise the endpoint's method list.
 */
export async function OPTIONS(): Promise<Response> {
  if (!(await ucpIdentityLinkingEnabled())) return ucpDisabledResponse();
  return allowResponse(ALLOWED_METHODS);
}
