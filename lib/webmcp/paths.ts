/**
 * Same-origin-path-værn for WebMCP's navigate-tool. En in-browser-agent må kun
 * navigere til interne stier — aldrig en ekstern origin (open-redirect/phishing-
 * værn).
 *
 * Implementationen bor nu i `lib/safe-path.ts` (motorens kerne) fordi
 * `components/LoginForm.tsx` har brug for præcis samme værn, og `lib/webmcp/`
 * prunes væk af `light`-profilen. Dette modul beholder navnet, så WebMCP-
 * kaldstederne er uændrede — og de to steder kan ikke længere drifte fra
 * hinanden. Adfærd + unit-tests er uændrede (tests/unit/webmcp-paths.test.ts).
 */
export { isSameOriginPath } from "@/lib/safe-path";
