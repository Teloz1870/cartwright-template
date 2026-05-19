import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";
import { brand } from "../brand.config";
import { getIndustryTemplate } from "../industry-templates";

// Same adapter-pattern som lib/db.ts: brug Turso hvis TURSO_DATABASE_URL er sat,
// ellers fallback til lokal SQLite. Lader os seede både local-dev og production-DB
// med samme script: `npx prisma db seed` mod den DB som .env peger på.
function makePrismaClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  const tursoToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (tursoUrl && tursoToken) {
    const adapter = new PrismaLibSQL({ url: tursoUrl, authToken: tursoToken });
    return new PrismaClient({ adapter });
  }
  return new PrismaClient();
}

const prisma = makePrismaClient();

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
    `[seed] Bruger industry-template: ${template.label} (${templateSlug}, via ${source})`,
  );

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

  for (const p of template.products) {
    const category = categoryRecords[p.categorySlug];
    if (!category) {
      console.warn(`[seed] Product "${p.name}" peger på ukendt category "${p.categorySlug}" — skippes`);
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

  await prisma.user.create({
    data: {
      email: brand.emails.admin,
      passwordHash: await bcrypt.hash("admin1234", 10),
      name: "Administrator",
      role: "admin",
    },
  });

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
        "Gratis fragt på alle ordrer over 499 kr — hele sommeren ☀️",
      // Solbrillen.dk har data fra før wizard-gate — markér setupComplete=true
      // så fresh-seed ikke trigger setup-wizard på en eksisterende shop.
      setupComplete: true,
    },
  });

  console.log(
    `[seed] Færdig: ${template.categories.length} kategorier, ${template.products.length} produkter, 2 rabatkoder, 1 admin (${brand.emails.admin}), default settings.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
