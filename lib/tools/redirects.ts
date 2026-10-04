import "server-only";

import { z } from "zod";
import { defineTool } from "@/lib/tools/types";
import { importRedirects, REDIRECT_IMPORT_LIMITS } from "@/lib/redirects/import";

/**
 * redirects.import — the agent side of the bulk CSV import (lib/redirects/
 * import.ts). `dryRun: true` is a read: it returns the plan and needs no
 * confirm. A real import is a site-level write like sitepack.import and
 * content.import_site, so it carries the same `settings:write` scope and the
 * same plan-first `confirm: true` gate.
 */

const count = z.number().int().nonnegative();
const importError = z.object({ line: count, reason: z.string() }).strict();
const plannedRedirect = z
  .object({
    line: z.number().int().positive(),
    fromPath: z.string(),
    toPath: z.string(),
    status: z.union([z.literal(301), z.literal(302)]),
    replaces: z.boolean(),
  })
  .strict();

const importRedirectsOutput = z.discriminatedUnion("dryRun", [
  z
    .object({
      dryRun: z.literal(true),
      valid: z.array(plannedRedirect),
      errors: z.array(importError),
      summary: z.object({ rows: count, valid: count, invalid: count, replaces: count }).strict(),
    })
    .strict(),
  z.object({ dryRun: z.literal(false), imported: count, skipped: count, errors: z.array(importError) }).strict(),
]);

const importRedirectsInput = z
  .object({
    csv: z.string().min(1, "csv must be a non-empty CSV string"),
    dryRun: z.boolean().optional(),
    confirm: z.boolean().optional(),
  })
  .refine((d) => d.dryRun === true || d.confirm === true, {
    message: "Requires confirm: true to import (or dryRun: true to preview).",
  });

export const importRedirectsTool = defineTool({
  name: "redirects.import",
  description: `Bulk-import 301/302 redirects from CSV 'from,to,status' (header row and status column optional, 301 by default; lines starting with # are ignored; at most ${REDIRECT_IMPORT_LIMITS.maxRows} rows / ${REDIRECT_IMPORT_LIMITS.maxBytes / 1024} KB per call). dryRun:true returns the plan — per-line errors and what would be saved — without writing anything. confirm:true applies it: valid rows are saved by source path in one transaction (an existing redirect with the same source is replaced), invalid rows are skipped and reported. Duplicate sources inside the file, chains in either direction (a destination that is itself a redirect source, in the file or already saved — or a source that a saved redirect already points at) and loops are refused — point every old URL directly at its final destination, written without a /da or /en prefix (the redirect keeps the reader's locale). Redirects fire on the edge via Redis (UPSTASH_*); without it they are saved but not active.`,
  scope: "settings:write",
  input: importRedirectsInput,
  output: importRedirectsOutput,
  examples: [
    { name: "Preview an import", body: { csv: "from,to,status\n/old-page,/new-page\n/sale,/campaign,302", dryRun: true } },
    { name: "Apply an import", body: { csv: "/old-page,/new-page", confirm: true } },
  ],
  handler: (args, ctx) =>
    importRedirects(args.csv, ctx.actor, {
      dryRun: args.dryRun === true,
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    }),
});

export const redirectsTools = [importRedirectsTool];
