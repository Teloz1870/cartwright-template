#!/usr/bin/env tsx
/**
 * Phase 10 Slice 3 — backfill MediaAsset rows for eksisterende billed-URLs.
 *
 * Itererer alle felter der i dag holder en string-URL og opretter MediaAsset-
 * rows + ProductMedia-joins / hero-FK'er hvor de mangler. Idempotent — kan
 * køres flere gange uden duplikater (dedup'es på URL).
 *
 * Felter der backfilles:
 *   Product.images           — JSON-array af URLs → MediaAsset[] + ProductMedia
 *   Category.heroImage       → MediaAsset + Category.heroImageAssetId
 *   Category.heroVideo       → MediaAsset (mime=video/mp4, durationSec=null)
 *                              + Category.heroVideoAssetId
 *   Page.heroImage           → MediaAsset + Page.heroImageAssetId
 *   Service.heroImage        → MediaAsset + Service.heroImageAssetId
 *   BrandingSettings.heroImage → MediaAsset + BrandingSettings.heroImageAssetId
 *
 * Kør:
 *   DATABASE_URL=... tsx scripts/backfill-media-assets.ts          (dry-run)
 *   DATABASE_URL=... tsx scripts/backfill-media-assets.ts --apply  (apply)
 *
 * Efter backfill: cron'en /api/cron/media-ai vil samle de nye assets op og
 * generere alt-tekst på næste tick.
 */

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

type Counter = {
  productImages: number;
  categoryHero: number;
  categoryVideo: number;
  pageHero: number;
  serviceHero: number;
  brandingHero: number;
  skippedExisting: number;
};

async function main(): Promise<void> {
  console.log(
    APPLY
      ? "🚀 Apply-mode: skriver til DB"
      : "🔍 Dry-run: ingen DB-writes (kør med --apply for at gemme)",
  );

  const counter: Counter = {
    productImages: 0,
    categoryHero: 0,
    categoryVideo: 0,
    pageHero: 0,
    serviceHero: 0,
    brandingHero: 0,
    skippedExisting: 0,
  };

  await backfillProductImages(counter);
  await backfillCategoryHero(counter);
  await backfillCategoryVideo(counter);
  await backfillPageHero(counter);
  await backfillServiceHero(counter);
  await backfillBrandingHero(counter);

  console.log("\n📊 Resultat:");
  console.log(JSON.stringify(counter, null, 2));

  if (!APPLY) {
    console.log(
      "\nIngen ændringer gemt. Kør med --apply for at backfille rigtigt.",
    );
  }
}

async function backfillProductImages(counter: Counter): Promise<void> {
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: { id: true, images: true },
  });
  for (const product of products) {
    const urls = parseImagesJson(product.images);
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const created = await ensureAsset(url, "image/jpeg");
      if (!created) {
        counter.skippedExisting++;
        // Stadig ensure ProductMedia-join for idempotens
        const existing = await prisma.mediaAsset.findFirst({
          where: { url },
          select: { id: true },
        });
        if (existing) {
          await ensureProductMedia(product.id, existing.id, i);
        }
        continue;
      }
      counter.productImages++;
      await ensureProductMedia(product.id, created.id, i);
    }
  }
}

async function backfillCategoryHero(counter: Counter): Promise<void> {
  const cats = await prisma.category.findMany({
    where: { heroImage: { not: null }, heroImageAssetId: null },
    select: { id: true, heroImage: true },
  });
  for (const c of cats) {
    if (!c.heroImage) continue;
    const asset = await ensureAsset(c.heroImage, "image/jpeg");
    if (!asset) {
      counter.skippedExisting++;
      const existing = await prisma.mediaAsset.findFirst({
        where: { url: c.heroImage },
        select: { id: true },
      });
      if (existing && APPLY) {
        await prisma.category.update({
          where: { id: c.id },
          data: { heroImageAssetId: existing.id },
        });
      }
      continue;
    }
    counter.categoryHero++;
    if (APPLY) {
      await prisma.category.update({
        where: { id: c.id },
        data: { heroImageAssetId: asset.id },
      });
    }
  }
}

async function backfillCategoryVideo(counter: Counter): Promise<void> {
  const cats = await prisma.category.findMany({
    where: { heroVideo: { not: null }, heroVideoAssetId: null },
    select: { id: true, heroVideo: true },
  });
  for (const c of cats) {
    if (!c.heroVideo) continue;
    const asset = await ensureAsset(c.heroVideo, "video/mp4");
    if (!asset) {
      counter.skippedExisting++;
      const existing = await prisma.mediaAsset.findFirst({
        where: { url: c.heroVideo },
        select: { id: true },
      });
      if (existing && APPLY) {
        await prisma.category.update({
          where: { id: c.id },
          data: { heroVideoAssetId: existing.id },
        });
      }
      continue;
    }
    counter.categoryVideo++;
    if (APPLY) {
      await prisma.category.update({
        where: { id: c.id },
        data: { heroVideoAssetId: asset.id },
      });
    }
  }
}

async function backfillPageHero(counter: Counter): Promise<void> {
  const pages = await prisma.page.findMany({
    where: { heroImage: { not: null }, heroImageAssetId: null },
    select: { id: true, heroImage: true },
  });
  for (const p of pages) {
    if (!p.heroImage) continue;
    const asset = await ensureAsset(p.heroImage, "image/jpeg");
    if (!asset) {
      counter.skippedExisting++;
      const existing = await prisma.mediaAsset.findFirst({
        where: { url: p.heroImage },
        select: { id: true },
      });
      if (existing && APPLY) {
        await prisma.page.update({
          where: { id: p.id },
          data: { heroImageAssetId: existing.id },
        });
      }
      continue;
    }
    counter.pageHero++;
    if (APPLY) {
      await prisma.page.update({
        where: { id: p.id },
        data: { heroImageAssetId: asset.id },
      });
    }
  }
}

async function backfillServiceHero(counter: Counter): Promise<void> {
  const services = await prisma.service.findMany({
    where: { heroImage: { not: null }, heroImageAssetId: null },
    select: { id: true, heroImage: true },
  });
  for (const s of services) {
    if (!s.heroImage) continue;
    const asset = await ensureAsset(s.heroImage, "image/jpeg");
    if (!asset) {
      counter.skippedExisting++;
      const existing = await prisma.mediaAsset.findFirst({
        where: { url: s.heroImage },
        select: { id: true },
      });
      if (existing && APPLY) {
        await prisma.service.update({
          where: { id: s.id },
          data: { heroImageAssetId: existing.id },
        });
      }
      continue;
    }
    counter.serviceHero++;
    if (APPLY) {
      await prisma.service.update({
        where: { id: s.id },
        data: { heroImageAssetId: asset.id },
      });
    }
  }
}

async function backfillBrandingHero(counter: Counter): Promise<void> {
  const branding = await prisma.brandingSettings.findUnique({
    where: { id: 1 },
    select: { id: true, heroImage: true, heroImageAssetId: true },
  });
  if (!branding || !branding.heroImage || branding.heroImageAssetId) return;
  const asset = await ensureAsset(branding.heroImage, "image/jpeg");
  if (!asset) {
    counter.skippedExisting++;
    const existing = await prisma.mediaAsset.findFirst({
      where: { url: branding.heroImage },
      select: { id: true },
    });
    if (existing && APPLY) {
      await prisma.brandingSettings.update({
        where: { id: 1 },
        data: { heroImageAssetId: existing.id },
      });
    }
    return;
  }
  counter.brandingHero++;
  if (APPLY) {
    await prisma.brandingSettings.update({
      where: { id: 1 },
      data: { heroImageAssetId: asset.id },
    });
  }
}

/**
 * Returnerer ny asset hvis oprettet, null hvis URL allerede har en MediaAsset.
 * I dry-run-mode opretter den ingenting men returnerer { id: "dry-run" }.
 */
async function ensureAsset(
  url: string,
  guessedMime: string,
): Promise<{ id: string } | null> {
  if (!url || !url.startsWith("http")) return null;
  const existing = await prisma.mediaAsset.findFirst({
    where: { url },
    select: { id: true },
  });
  if (existing) return null;
  if (!APPLY) {
    return { id: "dry-run" };
  }
  return prisma.mediaAsset.create({
    data: {
      url,
      mime: guessedMime,
      sizeBytes: 0, // ukendt for legacy URLs
      aiStatus: "pending",
      uploadedBy: "system:backfill",
    },
    select: { id: true },
  });
}

async function ensureProductMedia(
  productId: string,
  assetId: string,
  position: number,
): Promise<void> {
  if (!APPLY) return;
  if (assetId === "dry-run") return;
  await prisma.productMedia.upsert({
    where: { productId_assetId: { productId, assetId } },
    update: { position },
    create: { productId, assetId, position, role: "gallery" },
  });
}

function parseImagesJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

main()
  .catch((err: unknown) => {
    console.error("\n❌ Backfill fejlede:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
