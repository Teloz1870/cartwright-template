import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { withAudit, type AuditActor } from "@/lib/audit";

/**
 * Oversættelses-administration (WooCommerce-paritet / i18n). Redigér base→en
 * pr. entitet og gem i `translations`-JSON-feltet ({ en: { field } }).
 * Genbruger /api/admin/translate til auto-oversættelse i UI'et.
 *
 * v0.15.0: udvidet fra product/category til også page/service/post. Alle fem
 * modeller har allerede `translations Json?`, så det er ren wiring — én
 * tabel-drevet sti frem for fem grene pr. funktion.
 */

export type EntityType = "product" | "category" | "page" | "service" | "post";

/** Oversættelses-bare felter pr. type. */
export const TRANSLATABLE_FIELDS: Record<EntityType, readonly string[]> = {
  product: ["name", "description"],
  category: ["name", "description"],
  page: ["title", "body"],
  service: ["title", "shortDescription", "body"],
  post: ["title", "excerpt", "body"],
};

/** Feltet der bruges som menneske-label i status-listen (eksponeres som `name`). */
const LABEL_FIELD: Record<EntityType, string> = {
  product: "name",
  category: "name",
  page: "title",
  service: "title",
  post: "title",
};

/** Hvor hver type lander i TranslationStatus. */
const STATUS_KEY: Record<EntityType, keyof TranslationStatus> = {
  product: "products",
  category: "categories",
  page: "pages",
  service: "services",
  post: "posts",
};

/** Kun product har soft-delete; resten listes som de er. */
const SOFT_DELETE: Partial<Record<EntityType, Prisma.JsonObject>> = {
  product: { deletedAt: null },
};

/**
 * Minimal delegate-form, der dækker de tre kald vi bruger. Prisma-delegates har
 * forskellige overloads pr. model, så vi caster til denne fælles flade — args
 * holdes løse men ikke `any` (lint-rent).
 */
type TransDelegate = {
  findMany(args: {
    where?: Prisma.JsonObject;
    orderBy?: Record<string, "asc" | "desc">;
    select: Record<string, boolean>;
  }): Promise<Record<string, unknown>[]>;
  findUnique(args: {
    where: { id: string };
    select: Record<string, boolean>;
  }): Promise<Record<string, unknown> | null>;
  update(args: {
    where: { id: string };
    data: { translations: Prisma.InputJsonValue };
  }): Promise<unknown>;
};

function delegate(type: EntityType): TransDelegate {
  const map = {
    product: prisma.product,
    category: prisma.category,
    page: prisma.page,
    service: prisma.service,
    post: prisma.post,
  } as const;
  return map[type] as unknown as TransDelegate;
}

function hasEn(translations: unknown): boolean {
  const en = (translations as { en?: Record<string, unknown> } | null)?.en;
  return Boolean(en && typeof en === "object" && Object.keys(en).length > 0);
}

function extractEn(translations: unknown, fields: readonly string[]): Record<string, string> {
  const en = (translations as { en?: Record<string, unknown> } | null)?.en ?? {};
  const out: Record<string, string> = {};
  for (const f of fields) out[f] = typeof en[f] === "string" ? (en[f] as string) : "";
  return out;
}

type TransRow = { id: string; name: string; hasEn: boolean };

export type TranslationStatus = {
  products: TransRow[];
  categories: TransRow[];
  pages: TransRow[];
  services: TransRow[];
  posts: TransRow[];
};

const ENTITY_TYPES = Object.keys(TRANSLATABLE_FIELDS) as EntityType[];

export async function getTranslationStatus(): Promise<TranslationStatus> {
  const status: TranslationStatus = {
    products: [],
    categories: [],
    pages: [],
    services: [],
    posts: [],
  };

  await Promise.all(
    ENTITY_TYPES.map(async (type) => {
      const label = LABEL_FIELD[type];
      const where = SOFT_DELETE[type];
      const rows = await delegate(type).findMany({
        ...(where ? { where } : {}),
        orderBy: { [label]: "asc" },
        select: { id: true, [label]: true, translations: true },
      });
      status[STATUS_KEY[type]] = rows.map((r) => ({
        id: r.id as string,
        name: (r[label] as string) ?? "",
        hasEn: hasEn(r.translations),
      }));
    }),
  );

  return status;
}

export type EntityTranslation = {
  type: EntityType;
  id: string;
  fields: readonly string[];
  /** Kilde-værdier (base-locale). */
  source: Record<string, string>;
  /** Nuværende en-oversættelser. */
  en: Record<string, string>;
};

export async function getEntityForTranslation(
  type: EntityType,
  id: string,
): Promise<EntityTranslation | null> {
  const fields = TRANSLATABLE_FIELDS[type];
  const select: Record<string, boolean> = { id: true, translations: true };
  for (const f of fields) select[f] = true;

  const row = await delegate(type).findUnique({ where: { id }, select });
  if (!row) return null;

  const source: Record<string, string> = {};
  for (const f of fields) source[f] = (row[f] as string | null) ?? "";

  return {
    type,
    id,
    fields,
    source,
    en: extractEn(row.translations, fields),
  };
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
        const cur = await delegate(type).findUnique({
          where: { id },
          select: { translations: true },
        });
        const merged = { ...((cur?.translations as object) ?? {}), en: clean };
        await delegate(type).update({
          where: { id },
          data: { translations: merged as Prisma.InputJsonValue },
        });
      },
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kunne ikke gemme." };
  }
  return { ok: true };
}
