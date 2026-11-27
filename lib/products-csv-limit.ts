/**
 * How much CSV one product import may carry (PRODUCT-CSV-BODY-LIMIT).
 *
 * The import is a Server Action (`app/admin/produkter/import/actions.ts`) that
 * takes the whole file as one string. Next refuses an action request whose body
 * passes `experimental.serverActions.bodySizeLimit` — 1 MB by default, and
 * next.config.ts sets none — with a 413 before the action runs, so a larger
 * catalogue ended on the error page with nothing saved. The limit is global
 * (every Server Action in the app shares it), so raising it is an owner
 * decision, not this import's; the form refuses an oversized file up front and
 * says how to split it instead. If the global limit is ever raised, this
 * constant must move with it — tests/unit/products-csv-limit.test.ts fails
 * until it does.
 *
 * No `server-only`: the client form and the action read the same rule.
 */
export const CSV_IMPORT_MAX_BYTES = 1024 * 1024;

/** The limit as the owner reads it, in the MB Next counts (1 MB = 1024 × 1024 bytes). */
export const CSV_IMPORT_MAX_LABEL = `${CSV_IMPORT_MAX_BYTES / (1024 * 1024)} MB`;

/**
 * The size of the request body the import sends for `csv`. React sends a lone
 * string argument as the JSON text `["…"]`, so every quote and line break counts
 * twice and non-ASCII letters count as their UTF-8 bytes. This — not the file's
 * size on disk — is what Next measures against the limit.
 */
export function csvImportBodyBytes(csv: string): number {
  return new TextEncoder().encode(JSON.stringify([csv])).length;
}

/** `null` when `bytes` fits one import; otherwise the message that tells the owner to split the file. */
export function csvImportSizeError(bytes: number): string | null {
  if (bytes <= CSV_IMPORT_MAX_BYTES) return null;
  // Rounded up, so a file just over the line never reads as exactly the limit.
  const mb = Math.ceil((bytes / (1024 * 1024)) * 100) / 100;
  return (
    `This CSV is ${mb} MB as sent, and one import takes at most ${CSV_IMPORT_MAX_LABEL}. ` +
    `Split it into smaller files that each start with the header row, and import them one ` +
    `after another — rows are upserted by slug, so the parts add up to the whole file. ` +
    `Nothing was imported.`
  );
}
