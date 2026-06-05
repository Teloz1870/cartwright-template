"use server";

import type { Prisma } from "@/app/generated/prisma/client";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { scrapeProduct, type ScrapeResult } from "@/lib/scrape/product";

export async function scrapeProductAction(url: string): Promise<ScrapeResult> {
  await requireAdmin();
  return scrapeProduct(url);
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[æ]/g, "ae")
      .replace(/[ø]/g, "oe")
      .replace(/[å]/g, "aa")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "produkt"
  );
}

export type CreateScrapedInput = {
  name: string;
  description: string;
  priceKr: number | null;
  attributes: { key: string; value: string }[];
  imageUrls: string[];
  categoryId: string;
};

export async function createScrapedProductAction(
  input: CreateScrapedInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await requireAdmin();
  if (input.name.trim().length < 2) return { ok: false, error: "Navn for kort." };
  if (!input.categoryId) return { ok: false, error: "Vælg en kategori." };

  const base = slugify(input.name);
  const existing = await prisma.product.findUnique({ where: { slug: base }, select: { id: true } });
  const slug = existing ? `${base}-${Date.now().toString(36).slice(-4)}` : base;

  const attrs = input.attributes.filter((a) => a.key.trim() && a.value.trim());
  const data: Prisma.ProductUncheckedCreateInput = {
    name: input.name.trim(),
    slug,
    description: input.description.trim() || input.name.trim(),
    priceDkk: input.priceKr && input.priceKr > 0 ? Math.round(input.priceKr * 100) : 0,
    stock: 0,
    categoryId: input.categoryId,
    images: JSON.stringify(input.imageUrls.slice(0, 8)),
    ...(attrs.length
      ? { attributes: Object.fromEntries(attrs.map((a) => [a.key, a.value])) as Prisma.InputJsonValue }
      : {}),
  };

  let id = "";
  try {
    await withAudit(
      { actor: `user:${session.user.id}`, tool: "products.scrape_create", args: { slug } },
      async () => {
        const p = await prisma.product.create({ data });
        id = p.id;
      },
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kunne ikke oprette produkt." };
  }
  revalidatePath("/admin/produkter");
  return { ok: true, id };
}
