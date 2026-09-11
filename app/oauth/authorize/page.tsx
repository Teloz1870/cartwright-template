import { notFound, redirect } from "next/navigation";
import { brand } from "@/brand.config";
import { auth } from "@/lib/auth";
import { SCOPE_POLICIES } from "@/lib/ucp/oauth";
import { buildRedirect, validateAuthorizeParams } from "@/lib/ucp/authorize";
import { ucpIdentityLinkingEnabled } from "@/lib/ucp/gate";
import { decideAuthorization } from "./actions";

export const dynamic = "force-dynamic";

/**
 * /oauth/authorize — UCP identity-linking consent-side (Authorization Code +
 * PKCE). Validerer params, kræver en indlogget Cartwright-bruger (ellers →
 * login), og viser et samtykke med de ønskede scopes. Gated bag
 * ucpIdentityLinking (404 når off). Selve code-udstedelsen sker i
 * decideAuthorization (server action) efter eksplicit approve.
 */

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  if (!(await ucpIdentityLinkingEnabled())) notFound();

  const sp = await searchParams;
  const params = {
    response_type: one(sp.response_type),
    client_id: one(sp.client_id),
    redirect_uri: one(sp.redirect_uri),
    scope: one(sp.scope),
    code_challenge: one(sp.code_challenge),
    code_challenge_method: one(sp.code_challenge_method),
    state: one(sp.state),
  };

  const v = await validateAuthorizeParams(params);

  if (!v.ok) {
    if (v.kind === "redirect") {
      redirect(buildRedirect(v.redirectUri, { error: v.error, state: v.state }));
    }
    // no_redirect: kan ikke sikkert sende brugeren videre → vis fejl.
    return (
      <main className="mx-auto max-w-md p-8">
        <h1 className="text-xl font-semibold">Authorization error</h1>
        <p className="mt-2 text-sm opacity-80">
          {v.error}: {v.description}
        </p>
      </main>
    );
  }

  // Kræv en indlogget bruger til at samtykke.
  const session = await auth();
  if (!session?.user?.id) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, val]) => val !== undefined) as [string, string][],
    ).toString();
    const callbackUrl = `/oauth/authorize?${qs}`;
    redirect(`/${brand.defaultLocale}/account/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  // client_name er klient-selvrapporteret (RFC 7591 åben registrering) →
  // clamp længden og mærk den eksplicit som ikke-verificeret (anti-phishing).
  const displayName =
    v.clientName.length > 80 ? `${v.clientName.slice(0, 80)}…` : v.clientName;

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-xl font-semibold">Authorize {displayName}</h1>
      <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
        ⚠️ This is a third-party app and its name is <strong>self-reported</strong> — it
        has not been verified by {brand.storeName}. Only approve if you trust it.
      </p>
      <p className="mt-2 text-sm opacity-80">
        <strong>{displayName}</strong> wants permission to act on your behalf at{" "}
        {brand.storeName}. Review what it is requesting:
      </p>

      <ul className="mt-4 space-y-2">
        {v.scopes.map((s) => (
          <li key={s} className="rounded-md border border-current/10 p-3 text-sm">
            <code className="text-xs opacity-70">{s}</code>
            <div>{SCOPE_POLICIES[s]?.plain ?? s}</div>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs opacity-70">
        Signed in as {session.user.email}. Approving redirects you back to {v.clientName}.
      </p>

      <form action={decideAuthorization} className="mt-6 flex gap-3">
        {/* Hidden params — re-valideret server-side i decideAuthorization. */}
        <input type="hidden" name="response_type" value={params.response_type} />
        <input type="hidden" name="client_id" value={params.client_id} />
        <input type="hidden" name="redirect_uri" value={params.redirect_uri} />
        <input type="hidden" name="scope" value={v.scopes.join(" ")} />
        <input type="hidden" name="code_challenge" value={params.code_challenge} />
        <input
          type="hidden"
          name="code_challenge_method"
          value={params.code_challenge_method}
        />
        {params.state !== undefined && (
          <input type="hidden" name="state" value={params.state} />
        )}
        <button
          type="submit"
          name="decision"
          value="approve"
          className="rounded-md bg-current/90 px-4 py-2 text-sm font-medium text-[var(--color-bg,#fff)]"
        >
          Approve
        </button>
        <button
          type="submit"
          name="decision"
          value="deny"
          className="rounded-md border border-current/20 px-4 py-2 text-sm"
        >
          Deny
        </button>
      </form>
    </main>
  );
}
