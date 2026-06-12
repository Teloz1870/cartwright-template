import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

/**
 * Admin-API auth guard — the single most valuable security artifact in the
 * Day-1 parity-audit wave.
 *
 * It walks EVERY `app/api/admin/**​/route.ts` handler file and asserts the
 * source carries an admin auth guard. This makes the WHOLE CLASS of
 * "unauthenticated admin route" impossible to reintroduce — the exact failure
 * the audit found in `/api/admin/translate`, `/api/admin/generate-logo` and
 * `/api/admin/phone` (LLM cost abuse + open proxy on every deployed shop).
 *
 * What counts as a guard (any one of):
 *   - `requireAdminApi()`  — the canonical API guard (returns session | 401)
 *   - `requireAdmin()`     — the page guard (307 redirect); pre-existing routes
 *   - `auth()` + a `role !== "admin"` / `role === "admin"` check (hand-rolled)
 *   - a Bearer-token guard for the deliberately machine-only admin routes
 *     (CRON_SECRET migration tools; the Vibe-API-key external-tool endpoint).
 *     These can't use a session because they're called by curl/CI, not a
 *     browser — they are explicitly allow-listed below WITH the alt-auth
 *     pattern they must contain.
 *
 * Thin re-export route shims (`export { GET, POST } from "@/plugins/…"`) are
 * resolved to their implementation file, which is where the guard must live.
 */

const ADMIN_API_ROOT = resolve(__dirname, "../../app/api/admin");
const PROJECT_ROOT = resolve(__dirname, "../..");

/** HTTP method handlers a route file can export. */
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * Routes that are intentionally NOT session-guarded because they are called by
 * machines (curl / CI / external AI tools), never a logged-in browser. Each
 * MUST still carry the listed alternate-auth pattern — the test enforces that,
 * so "no auth at all" is still impossible. Path is relative to app/api/admin.
 */
const ALT_AUTH_ALLOWLIST: Record<string, RegExp> = {
  // One-shot Turso migration runners — Bearer CRON_SECRET (same as cron routes).
  "run-pending-migrations/route.ts": /CRON_SECRET/,
  "reset-demo-data/route.ts": /CRON_SECRET/,
  // External-tool push endpoint (v0/Cursor/Lovable) — Bearer Vibe API key.
  "vibe/push/route.ts": /vibeApiKey/,
};

/** Patterns that satisfy "this handler is admin-guarded". */
const SESSION_GUARD_PATTERNS: RegExp[] = [
  /requireAdminApi\s*\(/,
  /requireAdmin\s*\(/,
  // hand-rolled: auth() followed somewhere by a role check
  /role\s*!==\s*["']admin["']/,
  /role\s*===\s*["']admin["']/,
];

function walkRouteFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkRouteFiles(path, out);
    } else if (entry.name === "route.ts" || entry.name === "route.tsx") {
      out.push(path);
    }
  }
  return out;
}

/**
 * If a route file is a thin re-export (`export { … } from "@/…"`), resolve the
 * target module path so we read the guard from where the handler actually lives.
 * Returns the file paths whose combined source must contain the guard.
 */
function sourceFilesFor(routeFile: string): string[] {
  const src = readFileSync(routeFile, "utf-8");
  const reexport = src.match(
    /export\s*\{[^}]*\}\s*from\s*["']([^"']+)["']/,
  );
  if (!reexport) return [routeFile];

  const spec = reexport[1];
  // Resolve "@/…" alias to project root; relative specs to the route's dir.
  const base = spec.startsWith("@/")
    ? join(PROJECT_ROOT, spec.slice(2))
    : resolve(dirname(routeFile), spec);

  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = base.endsWith(".ts") || base.endsWith(".tsx")
      ? base
      : base + ext;
    if (existsSync(candidate)) return [routeFile, candidate];
  }
  // Could not resolve — fall back to the route file itself (test will fail
  // loudly if the guard isn't inline, which is the safe direction).
  return [routeFile];
}

const routeFiles = walkRouteFiles(ADMIN_API_ROOT).sort();

describe("admin-API auth guard (no unauthenticated /api/admin route can exist)", () => {
  it("discovers admin route files", () => {
    // Sanity: the walk found something. If this ever hits 0, the glob/path
    // broke and every per-route assertion would vacuously pass.
    expect(routeFiles.length).toBeGreaterThan(10);
  });

  for (const routeFile of routeFiles) {
    const rel = routeFile.slice(ADMIN_API_ROOT.length + 1);

    it(`guards every handler: ${rel}`, () => {
      const sources = sourceFilesFor(routeFile);
      const combined = sources.map((f) => readFileSync(f, "utf-8")).join("\n");

      // Which HTTP handlers does this route actually export?
      const exported = HTTP_METHODS.filter((m) =>
        new RegExp(
          `export\\s+(async\\s+)?function\\s+${m}\\b|export\\s*\\{[^}]*\\b${m}\\b`,
        ).test(combined),
      );
      expect(
        exported.length,
        `${rel} exports no HTTP handler — unexpected admin route shape`,
      ).toBeGreaterThan(0);

      const hasSessionGuard = SESSION_GUARD_PATTERNS.some((re) =>
        re.test(combined),
      );

      const altPattern = ALT_AUTH_ALLOWLIST[rel];
      const hasAltGuard = altPattern ? altPattern.test(combined) : false;

      expect(
        hasSessionGuard || hasAltGuard,
        `${rel} has NO admin auth guard. Add \`const guard = await requireAdminApi(); ` +
          `if (guard instanceof Response) return guard;\` (or, for a machine-only ` +
          `route, a Bearer-token check + an entry in ALT_AUTH_ALLOWLIST).`,
      ).toBe(true);
    });
  }
});
