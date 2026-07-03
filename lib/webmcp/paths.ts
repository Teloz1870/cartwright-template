/**
 * Same-origin-path-værn for WebMCP's navigate-tool. En in-browser-agent må kun
 * navigere til interne stier — aldrig en ekstern origin (open-redirect/phishing-
 * værn). Pure + unit-testet (lib/webmcp er klient-sikker — ingen server-only).
 */
export function isSameOriginPath(path: unknown): path is string {
  if (typeof path !== "string" || !path.startsWith("/")) return false;
  // Protocol-relative ("//evil.com") eller backslash-tricks ("/\\evil") → eksternt.
  if (path.startsWith("//") || path.startsWith("/\\")) return false;
  try {
    const base = "https://cartwright.invalid";
    return new URL(path, base).origin === base;
  } catch {
    return false;
  }
}
