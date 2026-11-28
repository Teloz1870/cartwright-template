export type TrustedClientIpEnvironment = {
  vercel?: string;
  trustProxyIpHeaders?: string;
};

function strictIpv4(candidate: string): string | null {
  const parts = candidate.split(".");
  if (parts.length !== 4) return null;
  for (const part of parts) {
    if (!/^(?:0|[1-9]\d{0,2})$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
  }
  return parts.join(".");
}

function canonicalIpv6(candidate: string): string | null {
  if (!candidate.includes(":")) return null;
  try {
    const hostname = new URL(`http://[${candidate}]/`).hostname;
    const canonical = hostname.startsWith("[")
      ? hostname.slice(1, -1)
      : hostname;
    return canonical.includes(":") ? canonical.toLowerCase() : null;
  } catch {
    return null;
  }
}

function normalizeForwardedIp(value: string | null): string {
  // A real textual IP is at most 45 characters. Cap the complete forwarding
  // header too, before splitting it, so attacker-controlled chains cannot
  // create oversized Redis keys or parsing work.
  if (!value || value.length > 256) return "unknown";
  const candidate = value.split(",", 1)[0]?.trim() ?? "";
  if (!candidate || candidate.length > 64) return "unknown";
  return strictIpv4(candidate) ?? canonicalIpv6(candidate) ?? "unknown";
}

// Self-hosted without CARTWRIGHT_TRUST_PROXY_IP_HEADERS, every visitor counts as
// one client. The X-Forwarded-For header cannot tell a proxied server from a
// directly reached one: Next's Node server fills it with the socket address
// whenever the request has none (base-server.js, `??=`), so it is present on
// every request either way. Say so in the log whenever this path is taken — once
// per server process, not per request, and never on Vercel or when the variable
// is set. Only in production: `pnpm dev` takes this path on every machine, and a
// fresh scaffold's first run should not open with a proxy warning.
//
// The once-flag lives on globalThis under a registered symbol, not in a
// module-level `let`: a production build holds several instances of this module
// in one process — the proxy.ts chunk, the route-handler chunks and the
// SSR/server-action runtime each evaluate their own copy — and a module-level
// flag gave each copy its own warning (three in one process, measured). Every
// engine caller runs in the Node.js runtime (proxy.ts cannot choose another, and
// no engine route sets `runtime = "edge"`), and that runtime is one JS realm per
// server process, so all copies share this one flag. A route a shop adds with
// `runtime = "edge"` runs in a sandbox with its own globalThis and may log the
// warning once more from there.
const UNTRUSTED_SELF_HOSTED_WARNED = Symbol.for("cartwright.untrustedSelfHostedWarned");

function onceFlags(): Record<symbol, boolean | undefined> {
  return globalThis as unknown as Record<symbol, boolean | undefined>;
}

function warnUntrustedSelfHostedOnce(): void {
  if (process.env.NODE_ENV !== "production") return;
  const flags = onceFlags();
  if (flags[UNTRUSTED_SELF_HOSTED_WARNED]) return;
  flags[UNTRUSTED_SELF_HOSTED_WARNED] = true;
  console.warn(
    '[cartwright] Self-hosted without CARTWRIGHT_TRUST_PROXY_IP_HEADERS set to "true" or "1": ' +
      "X-Forwarded-For is not trusted, so every visitor counts as one client — the contact form " +
      "(its AI answer, its attachments and the message itself), password reset, the public agent " +
      "API and the optional request limit in proxy.ts each have one rate-limit bucket that the " +
      "whole shop shares. Behind a reverse proxy that overwrites X-Forwarded-For, set " +
      "CARTWRIGHT_TRUST_PROXY_IP_HEADERS=true (or 1). If clients reach this server directly, put " +
      "such a proxy in front rather than setting the variable — without one the header is the " +
      "client's own and anyone could forge it. Logged once per server process; see " +
      "docs/self-hosting.md.",
  );
}

/** For tests — lets the once-per-server-process warning fire again. */
export function _resetUntrustedProxyWarningForTest(): void {
  delete onceFlags()[UNTRUSTED_SELF_HOSTED_WARNED];
}

/**
 * Resolve a conservative client identifier at both Edge and Node runtimes.
 * Vercel overwrites its ingress headers. Self-hosted deployments must opt in
 * only after placing Cartwright behind a proxy that overwrites client input.
 */
export function trustedClientIp(
  headers: Pick<Headers, "get">,
  environment: TrustedClientIpEnvironment = {
    vercel: process.env.VERCEL,
    trustProxyIpHeaders: process.env.CARTWRIGHT_TRUST_PROXY_IP_HEADERS,
  },
): string {
  const onVercel = environment.vercel === "1";
  const trustSelfHostedProxy = ["1", "true"].includes(
    environment.trustProxyIpHeaders?.trim().toLowerCase() ?? "",
  );
  if (!onVercel && !trustSelfHostedProxy) {
    warnUntrustedSelfHostedOnce();
    return "unknown";
  }

  const value = onVercel
    ? headers.get("x-vercel-forwarded-for") ?? headers.get("x-forwarded-for")
    : headers.get("x-forwarded-for") ?? headers.get("x-real-ip");
  return normalizeForwardedIp(value);
}
