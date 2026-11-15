import type { PrismaClient } from "@/app/generated/prisma/client";
import { createWooClient, type WooAuth, type WooClientOptions } from "@/lib/woo/client";
import { stockCandidates, withoutExactStock } from "@/lib/woo/decide";
import type { WooKind } from "@/lib/woo/groups";
import { preflightLedger, storeOf, type WooDialect } from "@/lib/woo/ledger";
import { planWooCatalog, type WooPlan, type WooPolicy } from "@/lib/woo/plan";
import { readViewAndLedger } from "@/lib/woo/read-view";
import type { WooSnapshot } from "@/lib/woo/types";

/**
 * W21-live-2 — the dry run of an import (spec 2026-10-25, §3C, §3D), which
 * scripts/woo-import.ts runs. What can stop it is checked before the shop is read;
 * then the shop, then this catalogue and its baseline as one point in time, then
 * decide() over each row with its writes simulated in the view. It writes nothing
 * and takes no lease. `--apply` is not in this version (W21-live-2a-4 opens it).
 */

export type WooImportScope = "categories" | "products" | "all";
/** `only`: `category:<Woo id>` and `product:<Woo id>`, so an id never reaches the other kind's row. */
export type WooImportArgs = { scope: WooImportScope; only: ReadonlySet<string> | null; json: boolean; sourcePricesIncludeVat?: boolean };

export type WooImportReport = {
  mode: "dry-run";
  store: string;
  scope: WooImportScope;
  only: string[] | null;
  read: WooSnapshot["meta"];
  /** `candidates`: the products a create needs wc/v3's stock for. `withoutExactStock` is null while none was read: unknown, never 0. */
  stock: { read: boolean; candidates: number; withoutExactStock: number | null };
  plan: WooPlan;
};

const SCOPES: readonly WooImportScope[] = ["categories", "products", "all"];
const BOOL_FLAGS = ["--apply", "--dry-run", "--json"];
const VALUE_FLAGS = ["--scope", "--only", "--source-prices-include-vat"];
/** The kind a scope takes, and what a bare id in `--only` means under it. */
const SCOPE_KIND: Partial<Record<WooImportScope, WooKind>> = { categories: "category", products: "product" };

function parseOnly(raw: string, scope: WooImportScope): Set<string> {
  const only = new Set<string>();
  for (const item of raw.split(",").map((s) => s.trim())) {
    const match = /^(?:(category|product):)?([1-9]\d*)$/.exec(item);
    if (!match) throw new Error(`--only takes category:<Woo id> or product:<Woo id>, comma-separated, and "${item}" is neither`);
    const kind = match[1] ?? SCOPE_KIND[scope];
    if (!kind) throw new Error(`--only ${item} does not say which kind it is: write category:${item} or product:${item}, or give --scope categories or products`);
    if (scope !== "all" && kind !== SCOPE_KIND[scope]) throw new Error(`--only ${item} is outside --scope ${scope}`);
    const name = `${kind}:${match[2]}`;
    if (only.has(name)) throw new Error(`--only names ${name} twice`);
    only.add(name);
  }
  return only;
}

/**
 * scripts/woo-import.ts's arguments. Every one must be an argument it knows: a typo,
 * a repeat or an empty value never falls back to a default, since a misspelt `--only`
 * would then mean the whole catalogue. `--name value` and `--name=value` both work.
 */
export function parseWooImportArgs(argv: readonly string[]): WooImportArgs {
  const values = new Map<string, string>();
  const bools = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const eq = argv[i].indexOf("=");
    const name = eq === -1 ? argv[i] : argv[i].slice(0, eq);
    if (bools.has(name) || values.has(name)) throw new Error(`${name} is given twice`);
    if (eq === -1 && BOOL_FLAGS.includes(name)) {
      bools.add(name);
      continue;
    }
    if (!VALUE_FLAGS.includes(name)) throw new Error(`unknown argument "${argv[i]}" (known: ${[...BOOL_FLAGS, ...VALUE_FLAGS].join(", ")})`);
    const value = eq === -1 ? argv[++i] : argv[i].slice(eq + 1);
    if (!value?.trim() || value.startsWith("--")) throw new Error(`${name} needs a value`);
    values.set(name, value);
  }
  if (bools.has("--apply")) throw new Error("--apply is not in this version, which only previews an import: run without it. Nothing was read or written.");
  const scope = (values.get("--scope") ?? "all") as WooImportScope;
  if (!SCOPES.includes(scope)) throw new Error(`--scope is one of ${SCOPES.join(", ")}`);
  const only = values.get("--only");
  const vat = values.get("--source-prices-include-vat");
  if (vat !== undefined && vat !== "yes" && vat !== "no") throw new Error("--source-prices-include-vat is yes or no");
  return { scope, only: only === undefined ? null : parseOnly(only, scope), json: bools.has("--json"), ...(vat !== undefined && { sourcePricesIncludeVat: vat === "yes" }) };
}

/** The wc/v3 key from env: both halves, or neither. Half a key is an error, never read as "no key". */
export function wooImportAuth(env: Readonly<Record<string, string | undefined>>): WooAuth | undefined {
  const user = env.WOO_AUTH_USER?.trim();
  const pass = env.WOO_AUTH_PASS?.trim();
  if (!user !== !pass) throw new Error("set both WOO_AUTH_USER and WOO_AUTH_PASS (the wc/v3 read key), or neither");
  return user && pass ? { user, pass } : undefined;
}

/** A narrowing is exact (INV-17): an id the shop does not list stops the run, for a typo must not read as "nothing to do". */
function assertOnlyListed({ categories, products }: WooSnapshot, only: ReadonlySet<string> | null): void {
  const listed = new Set([...categories.map((c) => `category:${c.id}`), ...products.map((p) => `product:${p.id}`)]);
  const unknown = [...(only ?? [])].filter((name) => !listed.has(name));
  if (unknown.length > 0) throw new Error(`--only names what the shop does not list: ${unknown.join(", ")}. Nothing was previewed.`);
}

export type WooPreviewDeps = {
  db: Pick<PrismaClient, "migrationProject" | "$queryRaw" | "$transaction">;
  dialect: WooDialect;
  /** This shop's currency and VAT basis (`brand.policies`). */
  policy: Omit<WooPolicy, "sourcePricesIncludeVat">;
  /** Our own site, the key and, in a test, the network. The shop is the project's. */
  client: Omit<WooClientOptions, "storeUrl">;
};

/** Spec §3C's pre-flight, then §3D's preview. It reads the ledger and leaves it as it found it. */
export async function previewWooImport({ scope, only, sourcePricesIncludeVat }: WooImportArgs, { db, dialect, policy, client: options }: WooPreviewDeps): Promise<WooImportReport> {
  const project = await db.migrationProject.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true, sourceUrl: true } });
  if (!project) throw new Error("No migration project yet, so no shop to read: set one up with migration.project_set (sourceUrl) or in /admin/migration.");
  // The constructor refuses half a key, a key over http and an address that is no shop's, with no request.
  const client = createWooClient({ ...options, storeUrl: project.sourceUrl });
  await preflightLedger(db, project.id, dialect);
  const snapshot = await client.fetchSnapshot();
  assertOnlyListed(snapshot, only);
  const { view, store, baseline } = await readViewAndLedger(db, dialect, project.id, storeOf(snapshot.storeUrl));
  const picked = (kind: WooKind, externalId: string) => (scope === "all" || SCOPE_KIND[scope] === kind) && (!only || only.has(`${kind}:${externalId}`));
  // Stock is asked for the selected products a create would need it for and no others, and counted from the facts, whatever a row's verdict.
  const selected = snapshot.products.filter((p) => picked("product", String(p.id))).map((p) => ({ id: p.id, type: p.type, row: { externalId: String(p.id) } }));
  const candidates = stockCandidates(selected, view, baseline.products);
  const stock = options.auth ? await client.stockOf(candidates.map((p) => p.id)) : null;
  const counted = { read: stock !== null, candidates: candidates.length, withoutExactStock: stock && withoutExactStock(candidates, view, baseline.products, stock) };
  const plan = await planWooCatalog(snapshot, view, { ...policy, sourcePricesIncludeVat }, { baseline, stock, picked });
  return { mode: "dry-run", store, scope, only: only && [...only], read: snapshot.meta, stock: counted, plan };
}
