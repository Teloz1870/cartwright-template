"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

/**
 * Task B variant-admin server-actions. Bevidst minimal API: en variant
 * defineres af sku + priceKr + stock + attributes (flat key/value).
 *
 * Sikkerhed: requireAdmin på hver action (kaster hvis ikke admin).
 * Pris-input er i kroner (priceKr) for konsistent UX med ProductForm; vi
 * konverterer til øre før DB-skrivning.
 */

const variantSchema = z.object({
  productId: z.string().min(1),
  sku: z
    .string()
    .min(1, "SKU er påkrævet")
    .max(80, "SKU er for langt")
    .regex(/^[a-zA-Z0-9._-]+$/, "SKU må kun indeholde bogstaver, tal, ., _, -"),
  priceKr: z.coerce.number().min(0, "Pris kan ikke være negativ"),
  stock: z.coerce.number().int().min(0, "Lager kan ikke være negativt"),
  // Flat key→string. JSON-string in/out — vi parser i action.
  attributesJson: z.string().min(2, "Attributes-JSON er påkrævet"),
});

type VariantActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function parseAttributes(json: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k !== "string" || typeof v !== "string" || !k.trim() || !v.trim()) {
        continue;
      }
      out[k.trim()] = v.trim();
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export async function createVariantAction(
  formData: FormData,
): Promise<VariantActionResult> {
  await requireAdmin();
  const parsed = variantSchema.safeParse({
    productId: formData.get("productId"),
    sku: formData.get("sku"),
    priceKr: formData.get("priceKr"),
    stock: formData.get("stock"),
    attributesJson: formData.get("attributesJson"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ugyldige data" };
  }
  const attributes = parseAttributes(parsed.data.attributesJson);
  if (!attributes) {
    return {
      ok: false,
      error: "Attributes skal være et JSON-objekt med string-værdier (fx { \"farve\": \"sort\" })",
    };
  }
  try {
    const variant = await prisma.productVariant.create({
      data: {
        productId: parsed.data.productId,
        sku: parsed.data.sku,
        priceDkk: Math.round(parsed.data.priceKr * 100),
        stock: parsed.data.stock,
        attributes,
      },
    });
    revalidatePath(`/admin/produkter/${parsed.data.productId}`);
    return { ok: true, id: variant.id };
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { ok: false, error: "Der findes allerede en variant med dette SKU" };
    }
    console.error("[createVariantAction]", err);
    return { ok: false, error: "Kunne ikke oprette varianten" };
  }
}

export async function updateVariantAction(
  variantId: string,
  formData: FormData,
): Promise<VariantActionResult> {
  await requireAdmin();
  const parsed = variantSchema.safeParse({
    productId: formData.get("productId"),
    sku: formData.get("sku"),
    priceKr: formData.get("priceKr"),
    stock: formData.get("stock"),
    attributesJson: formData.get("attributesJson"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ugyldige data" };
  }
  const attributes = parseAttributes(parsed.data.attributesJson);
  if (!attributes) {
    return {
      ok: false,
      error: "Attributes skal være et JSON-objekt med string-værdier",
    };
  }
  try {
    await prisma.productVariant.update({
      where: { id: variantId },
      data: {
        sku: parsed.data.sku,
        priceDkk: Math.round(parsed.data.priceKr * 100),
        stock: parsed.data.stock,
        attributes,
      },
    });
    revalidatePath(`/admin/produkter/${parsed.data.productId}`);
    return { ok: true, id: variantId };
  } catch (err) {
    console.error("[updateVariantAction]", err);
    return { ok: false, error: "Kunne ikke opdatere varianten" };
  }
}

/**
 * ULTRAPLAN-lite UL3: batch-create variants fra matrix-generator.
 * Tager en array af pre-byggede variant-rows (allerede valideret client-side)
 * og inserter dem i én transaktion. Skip-on-duplicate hvis SKU allerede findes
 * (admin har sikkert kørt generator to gange ved fejl) — vi rapporterer antal
 * oprettede vs skippede.
 */
const batchVariantSchema = z.object({
  productId: z.string().min(1),
  variants: z.array(
    z.object({
      sku: z
        .string()
        .min(1)
        .max(80)
        .regex(/^[a-zA-Z0-9._-]+$/, "SKU må kun indeholde bogstaver, tal, ., _, -"),
      priceDkk: z.number().int().min(0),
      stock: z.number().int().min(0),
      attributes: z.record(z.string(), z.string()),
    }),
  ).min(1).max(200), // sanity-cap: 200 variants i ét kald
});

export async function createVariantsBatchAction(
  input: unknown,
): Promise<{ ok: true; created: number; skipped: number } | { ok: false; error: string }> {
  await requireAdmin();
  const parsed = batchVariantSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ugyldige variant-data" };
  }

  const { productId, variants } = parsed.data;

  // Hent eksisterende SKUs for at kunne skip-on-duplicate uden race.
  // createMany med skipDuplicates er ikke supporteret på SQLite/libSQL, så
  // vi gør manuel filter + create-many.
  const existing = await prisma.productVariant.findMany({
    where: { productId, sku: { in: variants.map((v) => v.sku) } },
    select: { sku: true },
  });
  const existingSkus = new Set(existing.map((v) => v.sku));
  const toCreate = variants.filter((v) => !existingSkus.has(v.sku));

  if (toCreate.length === 0) {
    return { ok: true, created: 0, skipped: variants.length };
  }

  try {
    await prisma.$transaction(
      toCreate.map((v) =>
        prisma.productVariant.create({
          data: {
            productId,
            sku: v.sku,
            priceDkk: v.priceDkk,
            stock: v.stock,
            attributes: v.attributes,
          },
        }),
      ),
    );
    revalidatePath(`/admin/produkter/${productId}`);
    return { ok: true, created: toCreate.length, skipped: existingSkus.size };
  } catch (err) {
    console.error("[createVariantsBatchAction]", err);
    return { ok: false, error: "Batch-create fejlede. Tjek server-logs." };
  }
}

export async function deleteVariantAction(
  variantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    // Sluk relationer i CartItem/OrderItem (FK er SET NULL) før delete.
    // Order-snapshot-felter (variantSku + variantAttributes) bevares så
    // tidligere ordrer fortsat viser hvilken variant kunden bestilte.
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { productId: true },
    });
    await prisma.productVariant.delete({ where: { id: variantId } });
    if (variant) {
      revalidatePath(`/admin/produkter/${variant.productId}`);
    }
    return { ok: true };
  } catch (err) {
    console.error("[deleteVariantAction]", err);
    return { ok: false, error: "Kunne ikke slette varianten" };
  }
}
