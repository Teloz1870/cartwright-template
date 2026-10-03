import { NextRequest, NextResponse } from "next/server";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { createClient } from "@libsql/client";
import { prisma } from "@/lib/db";
import { brand } from "@/brand.config";
import { getIndustryTemplate } from "@/industry-templates";
import { orientSeedPages } from "@/industry-templates/seed-locale";
import { generateStrongPassword } from "@/lib/auth/password";

// Demo-admin-password kommer fra env (sæt DEMO_ADMIN_PASSWORD pr. canary i
// Vercel for et kendt demo-login). Uden env genereres et tilfældigt — så er der
// ALDRIG et hardcodet gæt-bart password, men password-login kræver da env (eller
// brug magic-link). Aldrig logget i klartekst.
const DEMO_ADMIN_PASSWORD =
  process.env.DEMO_ADMIN_PASSWORD?.trim() || generateStrongPassword();

/**
 * One-shot demo reset — applies pending Prisma migrations, then wipes +
 * reseeds Product + Category from the brand's industry-template.
 *
 * **WHY THIS EXISTS**
 * Demo canaries (demo.cartwright.app, solbrillen-dk-teloz1.vercel.app) were
 * showing "Produkt Alpha/Beta/Gamma/Delta" placeholder products from
 * industry-templates/generic/seed-data.ts because their DBs were seeded
 * with the wrong template at some point in the past. Header category-nav
 * was empty for the same reason. This route does a clean reset:
 *   1. Apply pending migrations so Prisma client matches DB schema
 *      (otherwise prisma.product.create may fail on missing columns).
 *   2. Wipe product catalog tables (preserving auth, orders, branding).
 *   3. Re-seed from getIndustryTemplate(brand.industryTemplate) — so
 *      Northbound gets coffee products + categories, Solbrillen gets
 *      sunglasses, etc.
 *   4. Upsert BrandingSettings.industryTemplate so DB-state matches
 *      brand.config — settings?.industryTemplate fallback chain stays
 *      consistent.
 *
 * **AUTH**
 * Bearer CRON_SECRET — same pattern as /api/admin/run-pending-migrations
 * and existing cron routes. Rotate CRON_SECRET via Vercel CLI to a known
 * value, redeploy, curl with that value, then optionally rotate back.
 *
 * **IDEMPOTENCY**
 * Safe to re-run. Migrations are idempotent (ledger-based). Wipe + re-seed
 * is deterministic — running twice gives the same result.
 *
 * **USAGE (per demo canary, NOT Teloz)**
 *   curl -X POST \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     https://<demo>/api/admin/reset-demo-data
 *
 * **WHAT IT TOUCHES**
 * Tables modified: ProductReview, OrderItem, ProductMedia, ProductVariant,
 * Product, Category, BrandingSettings (just the industryTemplate column).
 *
 * Tables preserved: User, Account, Session, Order, DiscountCode, all
 * Settings rows, MediaAsset, etc.
 *
 * **REMOVAL**
 * After demos are seeded, this route can be deleted in a cleanup PR
 * alongside /api/admin/run-pending-migrations (task #62).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

function cleanEnv(raw: string | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

async function applyPendingMigrations(
  client: ReturnType<typeof createClient>,
  log: string[],
): Promise<{ applied: string[]; before: number }> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS _prisma_migrations (
      id                      TEXT PRIMARY KEY NOT NULL,
      checksum                TEXT NOT NULL,
      finished_at             DATETIME,
      migration_name          TEXT NOT NULL,
      logs                    TEXT,
      rolled_back_at          DATETIME,
      started_at              DATETIME NOT NULL DEFAULT current_timestamp,
      applied_steps_count     INTEGER UNSIGNED NOT NULL DEFAULT 0
    )
  `);

  const dirEntries = readdirSync(MIGRATIONS_DIR)
    .filter((name) => statSync(join(MIGRATIONS_DIR, name)).isDirectory())
    .sort();

  const appliedRows = await client.execute({
    sql: "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL",
    args: [],
  });
  const already = new Set<string>(
    appliedRows.rows.map((row) => String(row.migration_name)),
  );
  const before = already.size;

  const pending = dirEntries.filter((name) => !already.has(name));
  const applied: string[] = [];

  for (const name of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const statements = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const startedAt = new Date().toISOString();
    let appliedSteps = 0;
    let skippedSteps = 0;

    try {
      for (const stmt of statements) {
        try {
          await client.execute(stmt);
          appliedSteps++;
        } catch (stmtErr) {
          // Idempotency: catch errors that mean "this statement's effect is
          // already present" so re-running on partially-applied DBs converges
          // toward fully-applied. Real schema errors still abort.
          const msg = (stmtErr as Error).message;
          const harmless =
            /already exists/i.test(msg) ||
            /duplicate column/i.test(msg) ||
            /duplicate key/i.test(msg) ||
            // "no such table" during ALTER means table was never created
            // for this DB (e.g. Service on solbrillen). Treat as no-op
            // since the column-add can't apply anyway.
            /no such table/i.test(msg);
          if (harmless) {
            skippedSteps++;
            continue;
          }
          throw stmtErr;
        }
      }
      await client.execute({
        sql: `INSERT INTO _prisma_migrations
              (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          randomUUID(),
          checksum,
          new Date().toISOString(),
          name,
          startedAt,
          appliedSteps,
        ],
      });
      applied.push(name);
      log.push(
        `  ✓ migrated ${name} (${appliedSteps} stmt applied, ${skippedSteps} skipped as already-present)`,
      );
    } catch (err) {
      log.push(
        `  ✗ migrate ${name} failed after ${appliedSteps} stmt: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  return { applied, before };
}

/**
 * Wipe product catalog in FK-safe order. Tables introduced by Phase 10
 * (ProductReview, ProductMedia) may not exist on un-migrated DBs — wrap
 * each deleteMany in .catch so a missing table doesn't abort the wipe.
 *
 * After this returns, Product + Category are both empty and any FK-children
 * have also been cleared. Safe to insert fresh rows.
 */
async function wipeProductCatalog(log: string[]): Promise<void> {
  const ops: Array<[string, () => Promise<unknown>]> = [
    ["ProductReview", () => prisma.productReview.deleteMany()],
    ["OrderItem", () => prisma.orderItem.deleteMany()],
    ["ProductMedia", () => prisma.productMedia.deleteMany()],
    ["ProductVariant", () => prisma.productVariant.deleteMany()],
    ["Product", () => prisma.product.deleteMany()],
    ["Category", () => prisma.category.deleteMany()],
  ];
  for (const [name, op] of ops) {
    try {
      const result = await op();
      const count =
        typeof result === "object" && result !== null && "count" in result
          ? (result as { count: number }).count
          : "?";
      log.push(`  - wiped ${name} (${count} rows)`);
    } catch (err) {
      log.push(`  - skipped ${name} (table missing or query error: ${(err as Error).message})`);
    }
  }
}

export async function POST(request: NextRequest) {
  // ─── Auth ──────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on this deploy" },
      { status: 500 },
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ─── Confirm Turso runtime is configured ───────────────────────────────
  const tursoUrl = cleanEnv(process.env.TURSO_DATABASE_URL);
  const tursoToken = cleanEnv(process.env.TURSO_AUTH_TOKEN);
  if (!tursoUrl || !tursoToken) {
    return NextResponse.json(
      { error: "TURSO_DATABASE_URL or TURSO_AUTH_TOKEN missing" },
      { status: 500 },
    );
  }

  const host = tursoUrl.replace(/^libsql:\/\//, "").replace(/\?.*$/, "");
  const log: string[] = [];

  try {
    const client = createClient({ url: tursoUrl, authToken: tursoToken });

    // ─── Step 0: clean-slate product schema ──────────────────────────────
    // The demo Turso DBs were originally created via `prisma db push` with
    // an OLD schema, then partial-drifted over time. Tables exist with
    // missing columns (e.g. Product.videoUrl, Category.* Phase 10 cols).
    // CREATE TABLE statements in migrations get skipped as "already
    // exists", but the existing tables have fewer columns than current
    // schema → prisma.product.create() fails with "no such column" at
    // seed time.
    //
    // Fix: DROP these product-catalog tables + their FK children, plus
    // clear the _prisma_migrations ledger entries that reference their
    // creation. Migration loop in Step 1 will then re-CREATE them with
    // the FULL current schema. User data (auth, orders, settings, etc.)
    // is preserved.
    log.push("== Step 0: clean-slate product schema ==");
    // Disable FK constraint checking so we can DROP tables that other
    // tables reference (e.g. Order, CartItem reference Product but we
    // keep them — they'll be empty-or-orphaned afterward, which is fine
    // for a demo reset). Re-enable at end. SQLite-specific.
    try {
      await client.execute("PRAGMA foreign_keys = OFF");
      log.push("  - FK constraints disabled");
    } catch {
      // Some libsql configs may not allow PRAGMA — drop will then fail
      // explicitly, which we log per-op below.
    }
    const dropOps: Array<[string, string]> = [
      ["ProductReview", "DROP TABLE IF EXISTS ProductReview"],
      ["ProductMedia", "DROP TABLE IF EXISTS ProductMedia"],
      ["ProductVariant", "DROP TABLE IF EXISTS ProductVariant"],
      ["OrderItem", "DROP TABLE IF EXISTS OrderItem"],
      ["CartItem", "DROP TABLE IF EXISTS CartItem"],
      ["Product", "DROP TABLE IF EXISTS Product"],
      ["Category", "DROP TABLE IF EXISTS Category"],
      // Phase I-3 polish: also drop Page so stale generic content
      // (om-os/faq from earlier seed runs) gets replaced with the
      // industry-template's branded Danish content.
      ["Page", "DROP TABLE IF EXISTS Page"],
    ];
    for (const [name, sql] of dropOps) {
      try {
        await client.execute(sql);
        log.push(`  - dropped ${name}`);
      } catch (err) {
        log.push(`  - drop ${name} failed: ${(err as Error).message}`);
      }
    }
    // Also clear ledger for any migration that touches these tables so
    // they re-run. Simpler: clear the whole ledger; migrations are
    // idempotent now (per Phase G3-style "already exists" tolerance).
    try {
      await client.execute("DELETE FROM _prisma_migrations");
      log.push("  - cleared _prisma_migrations ledger");
    } catch (err) {
      log.push(`  - clear ledger failed: ${(err as Error).message}`);
    }

    // ─── Step 1: apply pending migrations ────────────────────────────────
    log.push("== Step 1: migrations ==");
    const { applied, before } = await applyPendingMigrations(client, log);
    log.push(`Migrations: ${before} already applied, ${applied.length} newly applied`);

    // ─── Step 1a: ensure tables exist ────────────────────────────────────
    // Some Prisma models were added to schema.prisma + pushed via
    // `prisma db push` historically without a corresponding migration file.
    // On older DBs (e.g. solbrillen which predates Lead/Service), those
    // tables simply don't exist → prisma.lead.findMany() / prisma.service.*
    // throw "no such table" and cascade through admin pages (/admin/leads,
    // /admin/services, /admin/media → because MediaAsset relations join
    // Service). CREATE TABLE IF NOT EXISTS adds them with the current schema
    // shape and is a no-op when they already exist.
    log.push(`== Step 1a: ensure tables ==`);
    const tableCreates: Array<[string, string]> = [
      [
        "Lead",
        `CREATE TABLE IF NOT EXISTS Lead (
          id               TEXT PRIMARY KEY NOT NULL,
          name             TEXT NOT NULL,
          company          TEXT,
          email            TEXT NOT NULL,
          phone            TEXT,
          projectType      TEXT NOT NULL,
          budget           TEXT NOT NULL,
          message          TEXT,
          status           TEXT NOT NULL DEFAULT 'new',
          aiPriority       TEXT,
          aiSummary        TEXT,
          aiSuggestedReply TEXT,
          createdAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
      ],
      [
        "Service",
        `CREATE TABLE IF NOT EXISTS Service (
          id               TEXT PRIMARY KEY NOT NULL,
          slug             TEXT NOT NULL UNIQUE,
          title            TEXT NOT NULL,
          shortDescription TEXT,
          priceString      TEXT,
          heroImage        TEXT,
          heroImageAssetId TEXT,
          features         TEXT,
          body             TEXT NOT NULL,
          vibeHtml         TEXT,
          showInNav        INTEGER NOT NULL DEFAULT 0,
          navOrder         INTEGER NOT NULL DEFAULT 0,
          translations     TEXT,
          createdAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
      ],
    ];
    for (const [label, sql] of tableCreates) {
      try {
        await client.execute(sql);
        log.push(`  ✓ table ${label}`);
      } catch (err) {
        log.push(`  ✗ table ${label}: ${(err as Error).message}`);
      }
    }

    // ─── Step 1b: patch missing columns ──────────────────────────────────
    // Some schema columns are NOT in any migration — they were added to
    // schema.prisma + applied via `prisma db push` historically. After our
    // DROP + migration replay, those columns are missing → Prisma client's
    // SELECT * fails on first query. Patch them in. "duplicate column"
    // catch handles the case where they already exist.
    const columnPatches: Array<[string, string]> = [
      // Category
      ["Category.vibeHtml", `ALTER TABLE Category ADD COLUMN vibeHtml TEXT`],
      ["Category.translations", `ALTER TABLE Category ADD COLUMN translations TEXT`],
      // Product
      ["Product.vibeHtml", `ALTER TABLE Product ADD COLUMN vibeHtml TEXT`],
      ["Product.translations", `ALTER TABLE Product ADD COLUMN translations TEXT`],
      ["Product.videoUrl", `ALTER TABLE Product ADD COLUMN videoUrl TEXT`],
      ["Product.videoGenerationId", `ALTER TABLE Product ADD COLUMN videoGenerationId TEXT`],
      // Page — heroImage + metaTitle + metaDescription + showInNav + navOrder
      // + translations + vibeHtml all live only in schema.prisma. Without
      // these, prisma.page.findUnique() does SELECT * → "no such column"
      // → 500 on every /info/[slug] hit.
      ["Page.vibeHtml", `ALTER TABLE Page ADD COLUMN vibeHtml TEXT`],
      ["Page.heroImage", `ALTER TABLE Page ADD COLUMN heroImage TEXT`],
      ["Page.metaTitle", `ALTER TABLE Page ADD COLUMN metaTitle TEXT`],
      ["Page.metaDescription", `ALTER TABLE Page ADD COLUMN metaDescription TEXT`],
      ["Page.showInNav", `ALTER TABLE Page ADD COLUMN showInNav INTEGER DEFAULT 0`],
      ["Page.navOrder", `ALTER TABLE Page ADD COLUMN navOrder INTEGER DEFAULT 0`],
      ["Page.translations", `ALTER TABLE Page ADD COLUMN translations TEXT`],
      ["Page.status", `ALTER TABLE Page ADD COLUMN status TEXT NOT NULL DEFAULT 'published'`],
      // Service.status — same draft|published gate as Page (schema.prisma-only
      // column; without it prisma.service SELECT * 500s after a reset).
      ["Service.status", `ALTER TABLE Service ADD COLUMN status TEXT NOT NULL DEFAULT 'published'`],
      // BrandingSettings — ecommerceEnabled + defaultLocale + many wizard-
      // override fields exist in schema.prisma but never migrated. Header,
      // Footer, getBrand() all read these columns; missing-column error
      // ripples through every page render.
      ["BrandingSettings.ecommerceEnabled", `ALTER TABLE BrandingSettings ADD COLUMN ecommerceEnabled INTEGER DEFAULT 1`],
      ["BrandingSettings.defaultLocale", `ALTER TABLE BrandingSettings ADD COLUMN defaultLocale TEXT`],
      ["BrandingSettings.designSlug", `ALTER TABLE BrandingSettings ADD COLUMN designSlug TEXT`],
      ["BrandingSettings.voiceShopConfigJson", `ALTER TABLE BrandingSettings ADD COLUMN voiceShopConfigJson TEXT`],
      ["BrandingSettings.faviconBg", `ALTER TABLE BrandingSettings ADD COLUMN faviconBg TEXT`],
      ["BrandingSettings.faviconFg", `ALTER TABLE BrandingSettings ADD COLUMN faviconFg TEXT`],
      ["BrandingSettings.logoImageUrl", `ALTER TABLE BrandingSettings ADD COLUMN logoImageUrl TEXT`],
      ["BrandingSettings.logoMarkClass", `ALTER TABLE BrandingSettings ADD COLUMN logoMarkClass TEXT`],
      ["BrandingSettings.logoMarkStrokeWidth", `ALTER TABLE BrandingSettings ADD COLUMN logoMarkStrokeWidth INTEGER`],
      ["BrandingSettings.logoMarkViewBox", `ALTER TABLE BrandingSettings ADD COLUMN logoMarkViewBox TEXT`],
      ["BrandingSettings.logoTransform", `ALTER TABLE BrandingSettings ADD COLUMN logoTransform TEXT`],
      ["BrandingSettings.heroCta", `ALTER TABLE BrandingSettings ADD COLUMN heroCta TEXT`],
      ["BrandingSettings.websiteHeadline", `ALTER TABLE BrandingSettings ADD COLUMN websiteHeadline TEXT`],
      ["BrandingSettings.agenticPolicyJson", `ALTER TABLE BrandingSettings ADD COLUMN agenticPolicyJson TEXT`],
      ["BrandingSettings.setupComplete", `ALTER TABLE BrandingSettings ADD COLUMN setupComplete INTEGER DEFAULT 0`],
      ["BrandingSettings.themeJson", `ALTER TABLE BrandingSettings ADD COLUMN themeJson TEXT`],
      ["BrandingSettings.tagline", `ALTER TABLE BrandingSettings ADD COLUMN tagline TEXT`],
      ["BrandingSettings.domain", `ALTER TABLE BrandingSettings ADD COLUMN domain TEXT`],
      ["BrandingSettings.emailFrom", `ALTER TABLE BrandingSettings ADD COLUMN emailFrom TEXT`],
      ["BrandingSettings.emailFromName", `ALTER TABLE BrandingSettings ADD COLUMN emailFromName TEXT`],
      ["BrandingSettings.emailSupport", `ALTER TABLE BrandingSettings ADD COLUMN emailSupport TEXT`],
      ["BrandingSettings.emailAdmin", `ALTER TABLE BrandingSettings ADD COLUMN emailAdmin TEXT`],
      ["BrandingSettings.logoMarkPaths", `ALTER TABLE BrandingSettings ADD COLUMN logoMarkPaths TEXT`],
      // Order — Phase 2/3/4/Phase 5 fields ALL added via prisma db push
      // historically. /admin/ordrer + checkout flow hit "no such column"
      // until these exist.
      ["Order.phoneNumber", `ALTER TABLE "Order" ADD COLUMN phoneNumber TEXT`],
      ["Order.discountDkk", `ALTER TABLE "Order" ADD COLUMN discountDkk INTEGER DEFAULT 0`],
      ["Order.discountCode", `ALTER TABLE "Order" ADD COLUMN discountCode TEXT`],
      ["Order.isAiGenerated", `ALTER TABLE "Order" ADD COLUMN isAiGenerated INTEGER DEFAULT 0`],
      ["Order.aiAgentSource", `ALTER TABLE "Order" ADD COLUMN aiAgentSource TEXT`],
      ["Order.stripePaymentIntentId", `ALTER TABLE "Order" ADD COLUMN stripePaymentIntentId TEXT`],
      ["Order.paymentMethod", `ALTER TABLE "Order" ADD COLUMN paymentMethod TEXT`],
      ["Order.paidAt", `ALTER TABLE "Order" ADD COLUMN paidAt DATETIME`],
      ["Order.channel", `ALTER TABLE "Order" ADD COLUMN channel TEXT DEFAULT 'web'`],
      ["Order.acpSessionId", `ALTER TABLE "Order" ADD COLUMN acpSessionId TEXT`],
      ["Order.confirmationEmailSentAt", `ALTER TABLE "Order" ADD COLUMN confirmationEmailSentAt DATETIME`],
      ["Order.refundedAt", `ALTER TABLE "Order" ADD COLUMN refundedAt DATETIME`],
      ["Order.disputedAt", `ALTER TABLE "Order" ADD COLUMN disputedAt DATETIME`],
      // IntegrationSettings — wholesale-added via db push across Phase 2-10.
      // /admin/integrations upsert + chatModelResolved() reads many of these.
      ["IntegrationSettings.aiProvider", `ALTER TABLE IntegrationSettings ADD COLUMN aiProvider TEXT DEFAULT 'anthropic'`],
      ["IntegrationSettings.localAiEndpoint", `ALTER TABLE IntegrationSettings ADD COLUMN localAiEndpoint TEXT DEFAULT 'http://localhost:11434/v1'`],
      ["IntegrationSettings.localAiModel", `ALTER TABLE IntegrationSettings ADD COLUMN localAiModel TEXT DEFAULT 'gemma:7b'`],
      ["IntegrationSettings.anthropicModel", `ALTER TABLE IntegrationSettings ADD COLUMN anthropicModel TEXT DEFAULT 'claude-haiku-4-5'`],
      ["IntegrationSettings.localAiFallbackMode", `ALTER TABLE IntegrationSettings ADD COLUMN localAiFallbackMode TEXT DEFAULT 'on-error'`],
      ["IntegrationSettings.lastDegradedAt", `ALTER TABLE IntegrationSettings ADD COLUMN lastDegradedAt DATETIME`],
      ["IntegrationSettings.lastModelDetectedAt", `ALTER TABLE IntegrationSettings ADD COLUMN lastModelDetectedAt DATETIME`],
      ["IntegrationSettings.aiUsageJson", `ALTER TABLE IntegrationSettings ADD COLUMN aiUsageJson TEXT`],
      ["IntegrationSettings.anthropicApiKey", `ALTER TABLE IntegrationSettings ADD COLUMN anthropicApiKey TEXT`],
      ["IntegrationSettings.googleGeminiApiKey", `ALTER TABLE IntegrationSettings ADD COLUMN googleGeminiApiKey TEXT`],
      ["IntegrationSettings.voiceShopEnabled", `ALTER TABLE IntegrationSettings ADD COLUMN voiceShopEnabled INTEGER DEFAULT 0`],
      ["IntegrationSettings.voiceShopModel", `ALTER TABLE IntegrationSettings ADD COLUMN voiceShopModel TEXT DEFAULT 'gemini-2.5-flash-live'`],
      ["IntegrationSettings.voiceShopVoice", `ALTER TABLE IntegrationSettings ADD COLUMN voiceShopVoice TEXT DEFAULT 'Puck'`],
      ["IntegrationSettings.voiceShopAllowedToolsJson", `ALTER TABLE IntegrationSettings ADD COLUMN voiceShopAllowedToolsJson TEXT`],
      ["IntegrationSettings.voiceShopMaxMinutesPerSession", `ALTER TABLE IntegrationSettings ADD COLUMN voiceShopMaxMinutesPerSession INTEGER DEFAULT 5`],
      ["IntegrationSettings.voiceShopMaxMinutesPerDay", `ALTER TABLE IntegrationSettings ADD COLUMN voiceShopMaxMinutesPerDay INTEGER DEFAULT 60`],
      ["IntegrationSettings.voiceShopVisionEnabled", `ALTER TABLE IntegrationSettings ADD COLUMN voiceShopVisionEnabled INTEGER DEFAULT 1`],
      ["IntegrationSettings.voiceShopLastDailyUsageJson", `ALTER TABLE IntegrationSettings ADD COLUMN voiceShopLastDailyUsageJson TEXT`],
      ["IntegrationSettings.stripeSecretKey", `ALTER TABLE IntegrationSettings ADD COLUMN stripeSecretKey TEXT`],
      ["IntegrationSettings.stripePublishableKey", `ALTER TABLE IntegrationSettings ADD COLUMN stripePublishableKey TEXT`],
      ["IntegrationSettings.stripeWebhookSecret", `ALTER TABLE IntegrationSettings ADD COLUMN stripeWebhookSecret TEXT`],
      ["IntegrationSettings.resendApiKey", `ALTER TABLE IntegrationSettings ADD COLUMN resendApiKey TEXT`],
      ["IntegrationSettings.setupChecklist", `ALTER TABLE IntegrationSettings ADD COLUMN setupChecklist TEXT`],
      ["IntegrationSettings.videoGenerationApiKey", `ALTER TABLE IntegrationSettings ADD COLUMN videoGenerationApiKey TEXT`],
      ["IntegrationSettings.videoGenProvider", `ALTER TABLE IntegrationSettings ADD COLUMN videoGenProvider TEXT DEFAULT 'luma'`],
      ["IntegrationSettings.phoneIncWorkspaceId", `ALTER TABLE IntegrationSettings ADD COLUMN phoneIncWorkspaceId TEXT`],
      ["IntegrationSettings.phoneIncApiKey", `ALTER TABLE IntegrationSettings ADD COLUMN phoneIncApiKey TEXT`],
      ["IntegrationSettings.vercelToken", `ALTER TABLE IntegrationSettings ADD COLUMN vercelToken TEXT`],
      ["IntegrationSettings.vercelProjectId", `ALTER TABLE IntegrationSettings ADD COLUMN vercelProjectId TEXT`],
      ["IntegrationSettings.vibeApiKey", `ALTER TABLE IntegrationSettings ADD COLUMN vibeApiKey TEXT`],
    ];
    log.push(`== Step 1b: patch schema-only columns ==`);
    for (const [label, sql] of columnPatches) {
      try {
        await client.execute(sql);
        log.push(`  + ${label}`);
      } catch (err) {
        const msg = (err as Error).message;
        if (/duplicate column/i.test(msg) || /no such table/i.test(msg)) {
          log.push(`  ~ ${label} (already present or table missing)`);
        } else {
          log.push(`  ✗ ${label}: ${msg}`);
        }
      }
    }

    // ─── Step 2: resolve industry template from compile-time brand config ─
    log.push(`== Step 2: resolve template ==`);
    const slug = brand.industryTemplate ?? "generic";
    const template = getIndustryTemplate(slug);
    log.push(`brand.industryTemplate = "${slug}" → template "${template.label}"`);
    log.push(`  → ${template.categories.length} categories, ${template.products.length} products`);

    // ─── Step 3: wipe product catalog (FK-safe order) ────────────────────
    log.push(`== Step 3: wipe ==`);
    await wipeProductCatalog(log);

    // ─── Step 4: insert categories + products via raw SQL ────────────────
    // Bypass Prisma client because its RETURNING clause selects ALL schema
    // columns — including ones like `vibeHtml` that exist in schema.prisma
    // but were never created via migration (legacy `prisma db push`). Raw
    // INSERT only touches columns we explicitly name + doesn't depend on
    // schema parity with the DB.
    log.push(`== Step 4: seed (raw SQL) ==`);
    const categoryRecords: Record<string, { id: string }> = {};
    for (const c of template.categories) {
      const id = randomUUID();
      await client.execute({
        sql: `INSERT INTO Category (id, name, slug, description) VALUES (?, ?, ?, ?)`,
        args: [id, c.name, c.slug, c.description ?? null],
      });
      categoryRecords[c.slug] = { id };
      log.push(`  + category "${c.name}" (${c.slug})`);
    }

    let productCount = 0;
    for (const p of template.products) {
      const cat = categoryRecords[p.categorySlug];
      if (!cat) {
        log.push(`  ! skipped product "${p.name}" — unknown category "${p.categorySlug}"`);
        continue;
      }
      const id = randomUUID();
      // Only specify columns we know are in the Prisma schema as required-
      // or-with-default. createdAt has a default; updatedAt, deletedAt,
      // translations are nullable/optional and we skip them. `attributes`
      // rides along (nullable Json) so templates with merchandising
      // attributes reseed them — the column predates every template that
      // sets the field.
      await client.execute({
        sql: `INSERT INTO Product
              (id, name, slug, description, priceDkk, images, stock,
               frameColor, lensColor, brand, attributes, featured, categoryId)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id,
          p.name,
          p.slug,
          p.description,
          p.priceDkk,
          JSON.stringify(p.images),
          p.stock,
          p.frameColor ?? null,
          p.lensColor ?? null,
          p.brand ?? null,
          p.attributes ? JSON.stringify(p.attributes) : null,
          p.featured ? 1 : 0,
          cat.id,
        ],
      });
      productCount++;
      log.push(`  + product "${p.name}"`);
    }

    // ─── Step 4b: insert pages from template (raw SQL) ───────────────────
    // Page has only updatedAt (no createdAt) per Prisma schema. Other
    // optional columns (heroImage, metaTitle, showInNav, etc.) are left
    // NULL and apply their defaults — except `translations`, which carries the
    // template's secondary-locale copy and would otherwise silently drop every
    // /da rendering on a reset demo (see the follow-up UPDATE below).
    log.push(`== Step 4b: seed pages ==`);
    let pageCount = 0;
    const pageNowIso = new Date().toISOString();
    // Same orientation as prisma/seed.ts — a demo reset must land the shop's
    // base-locale copy in the base columns, not only beside them.
    for (const pg of orientSeedPages(template, brand.defaultLocale)) {
      const id = randomUUID();
      try {
        await client.execute({
          sql: `INSERT INTO Page (id, slug, title, body, updatedAt)
                VALUES (?, ?, ?, ?, ?)`,
          args: [id, pg.slug, pg.title, pg.body, pageNowIso],
        });
        pageCount++;
        log.push(`  + page "${pg.title}" (${pg.slug})`);
        // Secondary-locale copy lives in the Json `translations` column. It is
        // written as its OWN statement, not as another INSERT column, so a
        // legacy DB whose Page table predates the column degrades to exactly
        // the old behaviour (page seeded, translations missing) instead of
        // losing the page entirely. Only pages that ship translations pay it.
        if (pg.translations) {
          try {
            await client.execute({
              sql: `UPDATE Page SET translations = ? WHERE id = ?`,
              args: [JSON.stringify(pg.translations), id],
            });
          } catch (err) {
            log.push(
              `  ! page "${pg.slug}" translations skipped: ${(err as Error).message}`,
            );
          }
        }
      } catch (err) {
        // Page schema may differ on legacy DBs; log + continue so a
        // failed insert doesn't block the rest of the seed.
        log.push(`  ! page "${pg.slug}" insert failed: ${(err as Error).message}`);
      }
    }

    // ─── Step 5: align BrandingSettings.industryTemplate (raw SQL) ───────
    log.push(`== Step 5: BrandingSettings ==`);
    try {
      // INSERT OR IGNORE first to handle "fresh DB" case, then UPDATE the
      // industryTemplate column. Two statements avoid having to know all
      // required-column defaults at INSERT time on a partial schema.
      await client.execute({
        sql: `INSERT OR IGNORE INTO BrandingSettings
              (id, storeName, heroImage, announcement)
              VALUES (1, ?, ?, ?)`,
        args: [brand.storeName, brand.images.hero, ""],
      });
      await client.execute({
        sql: `UPDATE BrandingSettings SET industryTemplate = ? WHERE id = 1`,
        args: [slug],
      });
      // Clear themeJson + designSlug so app/layout.tsx's themeToInlineCss
      // doesn't inject an inline :root override with stale Teloz/solbrillen
      // navy values (which would otherwise win over coffee.css's :root in
      // light mode). The compile-time theme CSS file (themes/coffee.css
      // imported by globals.css) becomes the single source of truth again.
      try {
        await client.execute(
          `UPDATE BrandingSettings SET themeJson = NULL, designSlug = NULL WHERE id = 1`,
        );
        log.push(`  ✓ cleared themeJson + designSlug (use compile-time defaults)`);
      } catch (err) {
        log.push(`  ! clear themeJson failed: ${(err as Error).message}`);
      }
      log.push(`  ✓ BrandingSettings.industryTemplate = "${slug}"`);
    } catch (err) {
      log.push(`  ! BrandingSettings update failed: ${(err as Error).message}`);
    }

    // ─── Step 6: upsert admin user ───────────────────────────────────────
    // Matches the seed in prisma/seed.ts so demo visitors can log in to /admin
    // (admin@<domain> / DEMO_ADMIN_PASSWORD env). Pure-SQL UPSERT via INSERT OR
    // REPLACE for SQLite; mustChangePassword defaults to false (demo resets often).
    log.push(`== Step 6: admin user ==`);
    try {
      const adminEmail = brand.emails.admin;
      const passwordHash = await bcrypt.hash(DEMO_ADMIN_PASSWORD, 10);
      // Try to read existing id to preserve it across re-runs, else generate
      const existing = await client.execute({
        sql: "SELECT id FROM User WHERE email = ?",
        args: [adminEmail],
      });
      const userId =
        existing.rows.length > 0
          ? String(existing.rows[0].id)
          : randomUUID();
      // INSERT OR REPLACE rewrites the row with all required columns set.
      // Other optional columns get NULL or their schema defaults.
      await client.execute({
        sql: `INSERT OR REPLACE INTO User (id, email, name, passwordHash, role)
              VALUES (?, ?, ?, ?, ?)`,
        args: [userId, adminEmail, "Administrator", passwordHash, "admin"],
      });
      log.push(
        `  ✓ admin user "${adminEmail}" (password ${
          process.env.DEMO_ADMIN_PASSWORD
            ? "fra DEMO_ADMIN_PASSWORD"
            : "genereret — sæt DEMO_ADMIN_PASSWORD for et kendt demo-login"
        })`,
      );
    } catch (err) {
      log.push(`  ! admin user upsert failed: ${(err as Error).message}`);
    }

    return NextResponse.json({
      host,
      industryTemplate: slug,
      migrations_already_applied: before,
      migrations_newly_applied: applied.length,
      migrations_applied_names: applied,
      categories_seeded: template.categories.length,
      products_seeded: productCount,
      pages_seeded: pageCount,
      log,
    });
  } catch (err) {
    return NextResponse.json(
      { host, error: (err as Error).message, log },
      { status: 500 },
    );
  }
}
