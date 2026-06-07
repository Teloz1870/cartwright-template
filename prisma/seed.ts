import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { brand } from "../brand.config";
import { generateStrongPassword } from "../lib/auth/password";
import { getIndustryTemplate } from "../industry-templates";
import { productsJsonSchema } from "../industry-templates/products-schema";
import type { SeedProduct } from "../industry-templates/types";

// Same adapter-pattern som lib/db.ts: brug Turso hvis TURSO_DATABASE_URL er sat,
// ellers fallback til lokal SQLite. Lader os seede både local-dev og production-DB
// med samme script: `npx prisma db seed` mod den DB som .env peger på.
function makePrismaClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  const tursoToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (tursoUrl && tursoToken) {
    const adapter = new PrismaLibSql({ url: tursoUrl, authToken: tursoToken });
    return new PrismaClient({ adapter });
  }
  // Prisma 7 kræver en driver-adapter også for lokal SQLite — libSQL forbinder
  // til en lokal fil via file:-URL.
  const fileUrl = process.env.DATABASE_URL?.trim() || "file:./dev.db";
  const adapter = new PrismaLibSql({ url: fileUrl });
  return new PrismaClient({ adapter });
}

const prisma = makePrismaClient();

function loadProductsJson(): SeedProduct[] | null {
  const productsPath = path.join(__dirname, "products.json");
  if (!fs.existsSync(productsPath)) {
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(productsPath, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[seed] Failed to parse prisma/products.json: ${detail}`);
    process.exit(1);
  }

  const result = productsJsonSchema.safeParse(raw);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const pathText = issue.path.length
        ? issue.path
            .map((part, index) =>
              index === 0 ? `[${String(part)}]` : `.${String(part)}`,
            )
            .join("")
        : "";
      console.error(`[seed] products.json${pathText}: ${issue.message}`);
    }
    process.exit(1);
  }

  console.log(
    `[seed] Using products overlay from prisma/products.json (${result.data.length} rows)`,
  );
  return result.data;
}

/**
 * ULTRAPLAN-lite UL4: seed-script er nu industry-template-drevet.
 * Categories + pages + products læses fra `industry-templates/<slug>/seed-data.ts`
 * baseret på brand.industryTemplate (default: "eyewear"). Solbrillen.dk's content
 * er flyttet derhen for at gøre starter-kittet til en multi-template platform.
 *
 * Skift industry: rediger brand.industryTemplate i brand.config.ts
 * Tilføj ny: kopier industry-templates/generic → <navn>, registrer i index.ts
 */

async function main() {
  // UL8.2: Hvis BrandingSettings.industryTemplate er sat i DB (via wizard),
  // brug den; ellers fallback til brand.config compile-time default.
  // Note: ved fresh-fork er BrandingSettings tom — findUnique returnerer null
  // og vi falder gracefully tilbage til brand.config.
  const existingBranding = await prisma.brandingSettings
    .findUnique({ where: { id: 1 }, select: { industryTemplate: true } })
    .catch(() => null);
  const templateSlug =
    existingBranding?.industryTemplate || brand.industryTemplate;
  const template = getIndustryTemplate(templateSlug);
  const source = existingBranding?.industryTemplate ? "DB" : "brand.config";
  console.log(
    `[seed] Using industry template: ${template.label} (${templateSlug}, via ${source})`,
  );
  const products = loadProductsJson() ?? template.products;

  // Ryd eksisterende data (idempotent seed)
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.page.deleteMany();
  await prisma.category.deleteMany();
  await prisma.discountCode.deleteMany();
  await prisma.user.deleteMany();

  // Categories — merge SEO-data hvis template har categorySeo og slug matcher.
  // UL8.3: CATEGORIES_SEO flyttet til industry-templates/eyewear/category-seo.ts.
  // Generic-template har 0 SEO (admin tilføjer via /admin/kategorier-AI-knap).
  const seoList = template.categorySeo ?? [];
  const categoryRecords: Record<string, { id: string; slug: string }> = {};
  for (const c of template.categories) {
    const seo = seoList.find((s) => s.slug === c.slug);
    const data = seo
      ? {
          ...c,
          metaTitle: seo.metaTitle,
          metaDescription: seo.metaDescription,
          descriptionLong: seo.descriptionLong,
          faq: seo.faq,
        }
      : c;
    const created = await prisma.category.create({ data });
    categoryRecords[c.slug] = { id: created.id, slug: c.slug };
  }

  for (const page of template.pages) {
    await prisma.page.create({ data: page });
  }

  for (const p of products) {
    const category = categoryRecords[p.categorySlug];
    if (!category) {
      console.warn(`[seed] Product "${p.name}" points to unknown category "${p.categorySlug}" and will be skipped`);
      continue;
    }
    await prisma.product.create({
      data: {
        name: p.name,
        slug: p.slug,
        description: p.description,
        priceDkk: p.priceDkk,
        images: JSON.stringify(p.images),
        stock: p.stock,
        frameColor: p.frameColor,
        lensColor: p.lensColor,
        brand: p.brand,
        featured: p.featured ?? false,
        categoryId: category.id,
      },
    });
  }

  await prisma.discountCode.create({
    data: { code: "SOMMER10", type: "percent", value: 10, active: true },
  });
  await prisma.discountCode.create({
    data: { code: "VELKOMST50", type: "fixed", value: 5000, active: true },
  });

  // Sikkerhed: ALDRIG et hardcodet default-password. Brug ADMIN_PASSWORD hvis
  // sat, ellers generér et stærkt tilfældigt og print det ÉN gang. Genereret
  // password ⇒ mustChangePassword: admin tvinges til at skifte ved første login.
  const explicitAdminPw = process.env.ADMIN_PASSWORD?.trim();
  const adminPassword = explicitAdminPw || generateStrongPassword();
  await prisma.user.create({
    data: {
      email: brand.emails.admin,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      name: "Administrator",
      role: "admin",
      mustChangePassword: !explicitAdminPw,
    },
  });
  if (explicitAdminPw) {
    // Eksplicit ADMIN_PASSWORD: ejeren kender allerede sit password. Print kun en
    // diskret bekræftelse — skriv INTET til disk (ingen grund til at lække det).
    console.log(`[seed] Admin: ${brand.emails.admin} (fra ADMIN_PASSWORD)`);
  } else {
    // Genereret password: dette er ENESTE sted det vises i klartekst. En linje i
    // scrollback er nemt at miste, så vi gør to ting: (1) en iøjnefaldende boks i
    // terminalen, og (2) en backup-fil i repo-roden. Filen er gitignored +
    // mirror-excluded, så den aldrig når template-mirroren eller en commit.
    const banner =
      "\n┌─────────────────────────────────────────────────────────────┐\n" +
      "│  ADMIN-LOGIN (vises kun denne ene gang — gem det nu)        │\n" +
      "├─────────────────────────────────────────────────────────────┤\n" +
      `│  Email:    ${brand.emails.admin}\n` +
      `│  Password: ${adminPassword}\n` +
      "│                                                             │\n" +
      "│  → Log ind på /account/login → fanen 'Password'.            │\n" +
      "│  → Første login tvinger dig til et eget password            │\n" +
      "│    (/admin/konto); derefter åbner /admin/setup-guiden.      │\n" +
      "│  → Også gemt i .admin-credentials (slet filen bagefter).    │\n" +
      "│  → Magic-link kan bruges i stedet når RESEND_API_KEY er sat.│\n" +
      "└─────────────────────────────────────────────────────────────┘\n";
    console.log(banner);
    try {
      const credPath = path.join(process.cwd(), ".admin-credentials");
      fs.writeFileSync(
        credPath,
        `Cartwright admin-login (genereret ved seed ${new Date().toISOString()})\n\n` +
          `Email:    ${brand.emails.admin}\n` +
          `Password: ${adminPassword}\n\n` +
          `Log ind på /account/login → fanen "Password" med ovenstående.\n` +
          `Første login tvinger et password-skift (/admin/konto); derefter\n` +
          `åbner setup-guiden (/admin/setup).\n\n` +
          `Alternativer:\n` +
          `  • Magic-link: tilgængelig når RESEND_API_KEY er sat (i dev skrives\n` +
          `    login-linket til .mail-previews/ i stedet for at blive sendt).\n` +
          `  • Forvælg selv et password: sæt ADMIN_PASSWORD før 'prisma db seed'.\n\n` +
          `Slet denne fil når du har gemt password et sikkert sted. Den er\n` +
          `gitignored og bliver aldrig committet eller delt.\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      console.log(`[seed] Admin-login også gemt i .admin-credentials`);
    } catch (err) {
      // Backup-filen er en bekvemmelighed, ikke kritisk — password står i boksen
      // ovenfor uanset. Fald blødt tilbage hvis filsystemet er read-only.
      console.warn(`[seed] Kunne ikke skrive .admin-credentials: ${String(err)}`);
    }
  }

  // AI-first backbone — default settings rows. Singletons med id=1 så
  // lib/tools/settings.ts altid kan upsert(where: { id: 1 }, ...).
  await prisma.shippingSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      shippingFeeOere: brand.policies.shippingDefaultDkk,
      freeShippingThresholdOere: brand.policies.shippingFreeThresholdDkk,
    },
  });

  await prisma.brandingSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      storeName: brand.storeName,
      heroImage: brand.images.hero,
      announcement:
        "Free shipping on all orders over 499 DKK",
      // Solbrillen.dk har data fra før wizard-gate — markér setupComplete=true
      // så fresh-seed ikke trigger setup-wizard på en eksisterende shop.
      setupComplete: true,
    },
  });

  console.log(
    `[seed] Done: ${template.categories.length} categories, ${products.length} products, 2 discount codes, 1 admin (${brand.emails.admin}), default settings.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
