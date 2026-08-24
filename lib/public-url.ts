function normalizedHttpOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.username || parsed.password || !parsed.hostname) return null;
    parsed.pathname = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.origin;
  } catch {
    return null;
  }
}

/** Resolve the operator/deployment public origin without trusting request headers. */
export function configuredPublicUrl(fallback: string): string {
  const safeFallback = fallback.replace(/\/+$/, "");
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return normalizedHttpOrigin(configured) ?? safeFallback;

  // Vercel exposes these hostnames (without a scheme) at build and runtime
  // when System Environment Variables are enabled. Prefer the production
  // domain so previews emit stable canonicals; fall back to the deployment
  // URL only when the project domain is unavailable.
  const vercelHostname =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim();
  if (vercelHostname) {
    return normalizedHttpOrigin(`https://${vercelHostname}`) ?? safeFallback;
  }

  return safeFallback;
}
