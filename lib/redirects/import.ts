import "server-only";

import { prisma } from "@/lib/db";
import { withAudit, type AuditActor } from "@/lib/audit";
import { parseCsvRows } from "@/lib/products-csv";
import { normalizeFromPath, stripLocaleAndQuery, type RedirectMap } from "./match";
import { buildRedirectMap, redirectInputError, syncRedirectsToRedis } from "./store";

/**
 * Bulk redirect import from CSV `from,to,status` — the WooCommerce-migration
 * step where every old URL goes in BEFORE the DNS switch, previewed first.
 *
 * Pure half: `parseRedirectCsv` + `planRedirectImport` (no I/O) apply exactly
 * the rules `createRedirect` enforces one row at a time (`redirectInputError`,
 * the same function) plus the rules that only exist across rows: duplicates in
 * the file, chains in either direction (a destination that is itself a source,
 * in the file or already saved — or a source that a saved redirect already
 * points at) and loops. A chain is refused rather than followed because
 * every hop costs crawl budget and link equity — the import exists to keep
 * rankings. I/O half: `importRedirects` — a dry run returns the plan and writes
 * nothing; a real run upserts every valid row in ONE transaction under ONE
 * audit entry.
 */

export const REDIRECT_IMPORT_LIMITS = { maxRows: 2000, maxBytes: 256 * 1024 } as const;

export type RedirectCsvRow = { line: number; from: string; to: string; status: string };
export type RedirectImportError = { line: number; reason: string };
export type PlannedRedirect = {
  line: number;
  fromPath: string;
  toPath: string;
  status: 301 | 302;
  /** true when a saved redirect with this source gets replaced. */
  replaces: boolean;
};
export type RedirectImportPlan = {
  valid: PlannedRedirect[];
  errors: RedirectImportError[];
  summary: { rows: number; valid: number; invalid: number; replaces: number };
};
export type RedirectImportResult = { imported: number; skipped: number; errors: RedirectImportError[] };
export type RedirectImportOutcome =
  | ({ dryRun: true } & RedirectImportPlan)
  | ({ dryRun: false } & RedirectImportResult);

/**
 * CSV → rows. Header `from,to,status` optional (case-insensitive); status column
 * optional; UTF-8 BOM, CRLF, quoted fields with commas, blank lines and `#`
 * comment lines handled. `line` is the 1-based CSV record number (header,
 * blank and comment records count) — the physical line unless a quoted field
 * spans lines — so an error can be found in the owner's spreadsheet. Over
 * either bound the whole file is refused with ONE error — never silently
 * truncated.
 */
export function parseRedirectCsv(text: string): { rows: RedirectCsvRow[]; error: string | null } {
  const { maxRows, maxBytes } = REDIRECT_IMPORT_LIMITS;
  if (new TextEncoder().encode(text).length > maxBytes) {
    return { rows: [], error: `The CSV is larger than ${maxBytes / 1024} KB. Split it into smaller files.` };
  }
  const rows: RedirectCsvRow[] = [];
  parseCsvRows(text).forEach((cells, i) => {
    // trim() also removes a UTF-8 BOM (U+FEFF is WhiteSpace to it) — pinned by a test.
    const [first = "", second = "", third = ""] = cells.map((c) => c.trim());
    if (cells.every((c) => c.trim() === "") || first.startsWith("#")) return;
    if (rows.length === 0 && /^from$/i.test(first) && /^(to)?$/i.test(second)) return;
    rows.push({ line: i + 1, from: first, to: second, status: third });
  });
  if (rows.length > maxRows) {
    return {
      rows: [],
      error: `The CSV has ${rows.length} redirects; the limit is ${maxRows} per import. Split it into smaller files.`,
    };
  }
  return { rows, error: null };
}

/**
 * A relative destination is compared as the source path the matcher will look
 * it up under (locale prefix and query stripped — `/da/b` and `/b?x=1` both
 * reach a saved `/b`); external URLs never chain.
 */
const asSourcePath = (to: string) => (/^https?:\/\//i.test(to) ? null : stripLocaleAndQuery(to));

export function planRedirectImport(rows: RedirectCsvRow[], existing: RedirectMap): RedirectImportPlan {
  const errors: RedirectImportError[] = [];
  const candidates: PlannedRedirect[] = [];
  const seen = new Map<string, number>();
  for (const row of rows) {
    const fromPath = normalizeFromPath(row.from);
    let reason = redirectInputError(fromPath, row.to);
    if (!reason && row.status && row.status !== "301" && row.status !== "302") {
      reason = `Status must be 301 or 302 (got "${row.status}").`;
    }
    if (!reason && seen.has(fromPath)) reason = `Duplicate source path ${fromPath} (also on line ${seen.get(fromPath)}).`;
    if (reason) {
      errors.push({ line: row.line, reason });
      continue;
    }
    seen.set(fromPath, row.line);
    const status = row.status === "302" ? 302 : 301;
    candidates.push({ line: row.line, fromPath, toPath: row.to, status, replaces: fromPath in existing });
  }
  // Cross-row rules. Forward: EVERY candidate source counts, even one refused
  // below — the owner fixes the file as a whole, and a row in the file
  // overrides what is saved under the same source.
  const csvByFrom = new Map(candidates.map((c) => [c.fromPath, c.toPath]));
  const destinationOf = (from: string) => csvByFrom.get(from) ?? existing[from]?.to;
  // The other direction: a saved redirect that lands ON a source in the file
  // would become the first hop of a chain. A saved source is left out only
  // while its own row in the file is still valid — that row replaces it, so
  // `/a,/c` next to `/b,/c` is the fix. A row refused here un-replaces its
  // saved redirect, which can make a row accepted earlier the second hop of a
  // chain (saved `/a → /b`; file `/a,/b` + `/b,/c`: line 1 is a chain, so the
  // saved `/a` stays and line 2 must go too) — hence the fixed point. Every
  // pass but the last refuses at least one row, so there are at most
  // candidates + 1 passes.
  let valid = candidates;
  for (;;) {
    const replaced = new Set(valid.map((c) => c.fromPath));
    const savedInto = new Map<string, string>();
    for (const [from, rule] of Object.entries(existing)) {
      const into = asSourcePath(rule.to);
      if (into !== null && !replaced.has(from)) savedInto.set(into, from);
    }
    const kept: PlannedRedirect[] = [];
    for (const c of valid) {
      const target = asSourcePath(c.toPath);
      const next = target === null ? undefined : destinationOf(target);
      const upstream = savedInto.get(c.fromPath);
      if (next === undefined && upstream === undefined) kept.push(c);
      else if (next === undefined) {
        errors.push({
          line: c.line,
          reason: `${upstream} already redirects to ${c.fromPath}; chains are not allowed; point ${upstream} directly at the final destination.`,
        });
      } else if (asSourcePath(next) === c.fromPath) {
        errors.push({ line: c.line, reason: `Redirect loop: ${c.fromPath} → ${target} → ${c.fromPath}.` });
      } else {
        errors.push({
          line: c.line,
          reason: `${target} is itself redirected (to ${next}); chains are not allowed; point directly at the final destination.`,
        });
      }
    }
    if (kept.length === valid.length) break;
    valid = kept;
  }
  errors.sort((a, b) => a.line - b.line);
  const replaces = valid.filter((v) => v.replaces).length;
  return { valid, errors, summary: { rows: rows.length, valid: valid.length, invalid: errors.length, replaces } };
}

/** The dry run: parse + plan against what is saved. Reads only. */
export async function planRedirectCsv(text: string): Promise<RedirectImportPlan> {
  const { rows, error } = parseRedirectCsv(text);
  if (error) {
    return { valid: [], errors: [{ line: 0, reason: error }], summary: { rows: 0, valid: 0, invalid: 1, replaces: 0 } };
  }
  return planRedirectImport(rows, await buildRedirectMap());
}

export type RedirectImportOptions = {
  dryRun: boolean;
  requestId?: string;
  ip?: string | null;
  userAgent?: string | null;
};

type Opts<D extends boolean> = RedirectImportOptions & { dryRun: D };
export async function importRedirects(text: string, actor: AuditActor, opts: Opts<true>): Promise<{ dryRun: true } & RedirectImportPlan>;
export async function importRedirects(text: string, actor: AuditActor, opts: Opts<false>): Promise<{ dryRun: false } & RedirectImportResult>;
export async function importRedirects(text: string, actor: AuditActor, opts: RedirectImportOptions): Promise<RedirectImportOutcome>;
export async function importRedirects(
  text: string,
  actor: AuditActor,
  opts: RedirectImportOptions,
): Promise<RedirectImportOutcome> {
  const plan = await planRedirectCsv(text);
  if (opts.dryRun) return { dryRun: true, ...plan };
  if (plan.valid.length > 0) {
    await withAudit(
      {
        actor,
        tool: "redirects.import",
        // Never the CSV itself: the count is what an audit reader needs, and the
        // saved rows are the record of what landed.
        args: { count: plan.valid.length, dryRun: false },
        requestId: opts.requestId,
        ip: opts.ip,
        userAgent: opts.userAgent,
      },
      async () => {
        await prisma.$transaction(
          plan.valid.map((r) =>
            prisma.redirect.upsert({
              where: { fromPath: r.fromPath },
              update: { toPath: r.toPath, statusCode: r.status },
              create: { fromPath: r.fromPath, toPath: r.toPath, statusCode: r.status },
            }),
          ),
        );
        return { imported: plan.valid.length };
      },
    );
    await syncRedirectsToRedis();
  }
  return { dryRun: false, imported: plan.valid.length, skipped: plan.errors.length, errors: plan.errors };
}
