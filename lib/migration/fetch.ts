import "server-only";

import { brand } from "@/brand.config";
import { assertResolvedAddressesPublic, parseAndValidateUrl } from "@/lib/import/safe-fetch";

/**
 * MIGD — the migration dashboard's one network primitive. `fetchRemoteAsset`
 * stays image-specific (it follows redirects, throws on non-2xx); a parity check
 * needs ONE GET with `redirect: "manual"` and the status judged before the body:
 *
 * - a 3xx or 4xx is an ANSWER, never a page — its body is not read, so a
 *   "301 Moved" HTML stub can never pass for the page it points away from;
 * - no response (curl's 000), a 5xx or a 429 is INCONCLUSIVE — a source that is
 *   down or rate-limiting never fails a check; a 2xx with an empty body is an ERROR;
 * - a host outside `allowHosts`, an unsafe URL or one resolving to a private
 *   address is REFUSED unsent (safe-fetch's SSRF guard, run on every call — so
 *   every redirect hop a caller follows is re-validated).
 *
 * The address check and the connect resolve the name separately, so DNS
 * rebinding between them is not closed here: it is the accepted residual for
 * admin-scoped tools recorded in `lib/import/safe-fetch.ts`'s header ("KNOWN
 * RESIDUAL — DNS rebinding").
 *
 * Never throws: every outcome is a value the caller classifies.
 */

export type MigrationResponse =
  /** `body` is filled for a 2xx only (and a 404 asked for with `bodyOn404`); `truncated` = cut at `maxBytes`. */
  | { outcome: "answer"; url: string; status: number; location: string | null; contentType: string; body: string; truncated: boolean; xRobotsTag?: string | null }
  /** `status` 0 = no response at all. */
  | { outcome: "inconclusive" | "error"; url: string; status: number; reason: string }
  | { outcome: "refused"; url: string; status: 0; reason: string };

export type MigrationGetOptions = {
  /** Exact hostnames this call may reach (case-insensitive); anything else is refused unsent. */
  allowHosts: readonly string[];
  accept?: string;
  maxBytes?: number;
  timeoutMs?: number;
  /** Read a 404's body too — only for the soft-404 probe, which wants the site's own not-found page. */
  bodyOn404?: boolean;
};

/** What the checks receive: `migrationGet` with the host allowlist already bound. */
export type MigrationFetcher = (url: string, opts?: Pick<MigrationGetOptions, "accept" | "maxBytes" | "bodyOn404">) => Promise<MigrationResponse>;

const hostKey = (h: string) => h.toLowerCase().replace(/\.$/, "");
const reasonOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function migrationGet(raw: string, opts: MigrationGetOptions): Promise<MigrationResponse> {
  const refused = (url: string, reason: string) => ({ outcome: "refused", url, status: 0, reason }) as const;
  let url: URL;
  try {
    url = parseAndValidateUrl(raw);
  } catch (e) {
    return refused(raw, reasonOf(e));
  }
  if (url.username || url.password) return refused(url.href, "URL carries credentials.");
  if (!opts.allowHosts.some((h) => hostKey(h) === hostKey(url.hostname))) return refused(url.href, "foreign-host");
  const inconclusive = (status: number, reason: string) => ({ outcome: "inconclusive", url: url.href, status, reason }) as const;
  try {
    await assertResolvedAddressesPublic(url.hostname);
  } catch (e) {
    // A name that does not resolve is a host that is not there (yet) — 000, not a refusal.
    const reason = reasonOf(e);
    return reason.startsWith("Could not resolve host") ? inconclusive(0, reason) : refused(url.href, reason);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: opts.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5",
          "user-agent": `CartwrightMigration/1.0 (+${brand.url})`,
        },
      });
    } catch (e) {
      return inconclusive(0, controller.signal.aborted ? "timeout" : reasonOf(e));
    }
    const { status } = res;
    const location = res.headers.get("location");
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const xRobotsTag = res.headers.get("x-robots-tag");
    if ((status < 200 || status >= 300) && !(status === 404 && opts.bodyOn404)) {
      await res.body?.cancel().catch(() => {});
      if (status === 429 || status >= 500) return inconclusive(status, `HTTP ${status}`);
      return { outcome: "answer", url: url.href, status, location, contentType, body: "", truncated: false, xRobotsTag };
    }
    let read: { body: string; truncated: boolean };
    try {
      read = await readUpTo(res, opts.maxBytes ?? 256 * 1024);
    } catch (e) {
      return inconclusive(status, `body read failed: ${reasonOf(e)}`); // dropped mid-document
    }
    // An empty 2xx is no page; an empty 404 (asked for with bodyOn404) is still the site's 404 page.
    if (status !== 404 && read.body.trim() === "") return { outcome: "error", url: url.href, status, reason: "empty body" };
    return { outcome: "answer", url: url.href, status, location, contentType, ...read, xRobotsTag };
  } finally {
    clearTimeout(timer);
  }
}

/** Bind the host allowlist (and defaults) once, so checks only ever see a `MigrationFetcher`. */
export function migrationFetcher(base: MigrationGetOptions): MigrationFetcher {
  return (url, opts) => migrationGet(url, { ...base, ...opts });
}

/** Read at most `maxBytes`; unlike safe-fetch's `readCapped`, an over-long page is cut, not refused. */
async function readUpTo(res: Response, maxBytes: number): Promise<{ body: string; truncated: boolean }> {
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value.subarray(0, maxBytes - total));
    total += value.byteLength;
    if (total > maxBytes) {
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return { body: new TextDecoder().decode(Buffer.concat(chunks)), truncated };
}
