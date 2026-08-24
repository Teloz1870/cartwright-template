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
  if (!onVercel && !trustSelfHostedProxy) return "unknown";

  const value = onVercel
    ? headers.get("x-vercel-forwarded-for") ?? headers.get("x-forwarded-for")
    : headers.get("x-forwarded-for") ?? headers.get("x-real-ip");
  return normalizeForwardedIp(value);
}
