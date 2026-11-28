#!/usr/bin/env tsx
/**
 * W21-live-2a — import the migration project's WooCommerce shop into this catalogue
 * (lib/woo/run-import.ts, lib/woo/apply.ts). The owner's tool, run by hand; CI runs it only on a fake shop.
 *
 *   pnpm -s woo:import [--dry-run | --apply] [--scope categories|products|all] [--json]
 *     [--only category:<woo id>,product:<woo id>,…] [--source-prices-include-vat yes|no]
 *
 * By default it reads the shop (GETs only) and this catalogue, prints what an import would do and
 * writes nothing. `--apply` writes what is in scope, categories first, then products, under one audit
 * row; with products in scope it needs the wc/v3 key, or it stops before anything is read. A script runs
 * outside Next.js, so no page is revalidated: a cached page keeps its old text until its cache is renewed. A bare id in `--only`
 * needs `--scope categories` or `products`. Until `--source-prices-include-vat` is given,
 * every product is blocked: prices are never converted.
 *
 * Env: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, as lib/db.ts reads them; WOO_AUTH_USER and
 * WOO_AUTH_PASS, a wc/v3 read key (a consumer key and its secret, or a WP user and an application
 * password), without which a new product's stock is not checked, and no product is written. The shop is the project's sourceUrl.
 */

function fail(message: string): never {
  // One line of plain text: a shop's answer that is not JSON reaches here quoted in the parser's message.
  console.error(`woo-import: ${message.replace(/\p{Cc}+/gu, " ")}`);
  process.exit(1);
}

async function main() {
  // .env.local first: Node never overwrites a variable already set, so it wins over .env.
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // no such file
    }
  }
  // Before the database is opened: an argument it does not know, --apply or half a key stops here.
  const { assertApplyKeyed, parseWooImportArgs, previewWooImport, wooImportAuth } = await import("../lib/woo/run-import");
  const args = parseWooImportArgs(process.argv.slice(2));
  const auth = wooImportAuth(process.env);
  assertApplyKeyed(args, auth);
  const { brand } = await import("../brand.config");
  const { isPostgresDriver, prisma } = await import("../lib/db");
  const { formatReport } = await import("../lib/woo/report");
  const { currency, pricesIncludeVat } = brand.policies;
  const deps = { db: prisma, dialect: isPostgresDriver() ? ("postgres" as const) : ("sqlite" as const), policy: { currency, pricesIncludeVat }, client: { siteUrl: brand.url, auth } };
  const { applyWooImport, auditedWooImport } = await import("../lib/woo/apply");
  const report = args.apply ? await auditedWooImport((await import("../lib/audit")).withAudit, args, () => applyWooImport(args, deps)) : await previewWooImport(args, deps);
  // JSON leaves the shop's U+007F to U+009F raw, and U+009B opens an escape sequence on some terminals. Escaped, the data is the same.
  console.log(args.json ? JSON.stringify(report, null, 2).replace(/[\u007f-\u009f]/g, (c) => `\\u00${c.charCodeAt(0).toString(16)}`) : formatReport(report));
  await prisma.$disconnect();
  const done = report.apply;
  if (done?.stopped) fail(`stopped: ${done.stopped}. What committed before it is kept, with its baseline; run it again.`);
  if (done && !done.postconditions.ok) fail(`the read after the run found what it must not: ${done.postconditions.failures.join("; ")}`);
}

main().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
