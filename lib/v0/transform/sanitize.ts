/**
 * Defense-in-depth HTML sanitizer for v0-generated markup (pure, testable).
 *
 * The primary security boundary is admin-auth: only an authenticated admin can
 * trigger v0 generation, and the result is reviewed in the sandbox before it's
 * saved. But v0 is an *external* service emitting arbitrary code, so we strip
 * the obviously dangerous constructs before the HTML reaches `vibeHtml` /
 * dangerouslySetInnerHTML / the preview iframe.
 *
 * This is a focused regex strip, not a full allowlist parser — it deliberately
 * keeps arbitrary Tailwind markup intact (an allowlist would false-strip too
 * much). It is NOT a substitute for the admin-auth boundary; it hardens it.
 */
export function sanitizeVibeHtml(html: string): string {
  if (!html) return "";
  let out = html;

  // Remove <script>…</script> blocks + any orphan/self-closing script tags.
  out = out.replace(/<script\b[\s\S]*?<\/script\s*>/gi, "");
  out = out.replace(/<script\b[^>]*\/?>/gi, "");

  // Remove embedding vectors entirely (open + close tags).
  out = out.replace(/<\/?(iframe|object|embed)\b[^>]*>/gi, "");

  // Strip inline event handlers (onClick=, onload=, …) in any quoting style.
  out = out.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*\{[^}]*\}/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");

  // Neutralize javascript: URLs in href/src, then belt-and-suspenders any rest.
  out = out.replace(/(href|src)\s*=\s*"javascript:[^"]*"/gi, '$1="#"');
  out = out.replace(/(href|src)\s*=\s*'javascript:[^']*'/gi, "$1='#'");
  out = out.replace(/javascript:/gi, "");

  return out.trim();
}
