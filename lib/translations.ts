import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withAudit, type AuditActor } from "@/lib/audit";

/**
 * Oversættelses-administration (WooCommerce-paritet / i18n). Redigér da+en
 * pr. produkt/kategori og gem i `translations`-JSON-feltet ({ en: { field } }).
 * Genbruger /api/admin/translate til auto-oversættelse i UI'et.
 */

export type EntityType = "product" | "category";

/** Oversættelses-bare felter pr. type. */
export const TRANSLATABLE_FIELDS: Record<EntityType, readonly string[]> = {
  product: ["name", "description"],
  category: ["name", "description"],
};

function hasEn(translations: unknown): boolean {
  const en = (translations as { en?: Record<string, unknown> } | null)?.en;
  return Boolean(en && typeof en === "object" && Object.keys(en).length > 0);
}

export type TranslationStatus = {
  products: { id: string; name: string; hasEn: boolean }[];
  categories: { id: string; name: string; hasEn: boolean }[];
};

export async function getTranslationStatus(): Promise<TranslationStatus> {
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, translations: true },
    }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, translations: true },
    }),
  ]);
  return {
    products: products.map((p) => ({ id: p.id, name: p.name, hasEn: hasEn(p.translations) })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, hasEn: hasEn(c.translations) })),
  };
}

export type EntityTranslation = {
  type: EntityType;
  id: string;
  fields: readonly string[];
  /** Kilde-værdier (da). */
  source: Record<string, string>;
  /** Nuværende en-oversættelser. */
  en: Record<string, string>;
};

export async function getEntityForTranslation(
  type: EntityType,
  id: string,
): Promise<EntityTranslation | null> {
  if (type === "product") {
    const p = await prisma.product.findUnique({
      where: { id },
      select: { id: true, name: true, description: true, translations: true },
    });
    if (!p) return null;
    return {
      type,
      id,
      fields: TRANSLATABLE_FIELDS.product,
      source: { name: p.name, description: p.description },
      en: extractEn(p.translations, TRANSLATABLE_FIELDS.product),
    };
  }
  const c = await prisma.category.findUnique({
    where: { id },
    select: { id: true, name: true, description: true, translations: true },
  });
  if (!c) return null;
  return {
    type,
    id,
    fields: TRANSLATABLE_FIELDS.category,
    source: { name: c.name, description: c.description ?? "" },
    en: extractEn(c.translations, TRANSLATABLE_FIELDS.category),
  };
}

function extractEn(translations: unknown, fields: readonly string[]): Record<string, string> {
  const en = (translations as { en?: Record<string, unknown> } | null)?.en ?? {};
  const out: Record<string, string> = {};
  for (const f of fields) out[f] = typeof en[f] === "string" ? (en[f] as string) : "";
  return out;
}

export async function saveEntityTranslation(
  type: EntityType,
  id: string,
  en: Record<string, string>,
  actor: AuditActor,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Behold kun de oversættelses-bare felter med indhold.
  const clean: Record<string, string> = {};
  for (const f of TRANSLATABLE_FIELDS[type]) {
    const v = (en[f] ?? "").trim();
    if (v) clean[f] = v;
  }

  try {
    await withAudit(
      { actor, tool: "translations.save", args: { type, id } },
      async () => {
        if (type === "product") {
          const cur = await prisma.product.findUnique({ where: { id }, select: { translations: true } });
          const merged = { ...((cur?.translations as object) ?? {}), en: clean };
          await prisma.product.update({
            where: { id },
            data: { translations: merged as Prisma.InputJsonValue },
          });
        } else {
          const cur = await prisma.category.findUnique({ where: { id }, select: { translations: true } });
          const merged = { ...((cur?.translations as object) ?? {}), en: clean };
          await prisma.category.update({
            where: { id },
            data: { translations: merged as Prisma.InputJsonValue },
          });
        }
      },
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kunne ikke gemme." };
  }
  return { ok: true };
}
