/** Resolve the operator-configured public origin without trusting malformed input. */
export function configuredPublicUrl(fallback: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return fallback.replace(/\/+$/, "");

  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return fallback.replace(/\/+$/, "");
    }
    parsed.pathname = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.origin;
  } catch {
    return fallback.replace(/\/+$/, "");
  }
}
