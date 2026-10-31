"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

/**
 * Task B variant-admin server-actions. Bevidst minimal API: en variant
 * defined by sku + priceKr + stock + attributes (flat key/value).
 *
 * Security: requireAdmin on every action (throws if the caller is not an admin).
 * Price input is in kroner (priceKr) for UX consistency with ProductForm; we
 * convert to øre before writing to the DB.
 */

const variantSchema = z.object({
  productId: z.string().min(1),
  sku: z
    .string()
    .min(1, "SKU is required")
    .max(80, "SKU er for langt")
    .regex(/^[a-zA-Z0-9._-]+$/, "SKU may only contain letters, numbers, ., _, -"),
  priceKr: z.coerce.number().min(0, "Price cannot be negative"),
  stock: z.coerce.number().int().min(0, "Stock cannot be negative"),
  // Flat key→string. JSON string in/out — we parse in the action.
  attributesJson: z.string().min(2, "Attributes JSON is required"),
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
      error: "Attributes must be a JSON object with string values (for example { \"color\": \"black\" })",
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
      return { ok: false, error: "A variant with this SKU already exists" };
    }
    console.error("[createVariantAction]", err);
    return { ok: false, error: "Could not create the variant" };
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
      error: "Attributes must be a JSON object with string values",
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
    return { ok: false, error: "Could not update the variant" };
  }
}

/**
 * ULTRAPLAN-lite UL3: batch-create variants from the matrix generator.
 * Takes an array of pre-built variant rows (already validated client-side)
 * and inserts them in one transaction. Skip-on-duplicate if the SKU already exists
 * (the admin has probably run the generator twice by mistake) — we report the
 * number created vs skipped.
 */
const batchVariantSchema = z.object({
  productId: z.string().min(1),
  variants: z.array(
    z.object({
      sku: z
        .string()
        .min(1)
        .max(80)
        .regex(/^[a-zA-Z0-9._-]+$/, "SKU may only contain letters, numbers, ., _, -"),
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

  // Fetch existing SKUs so we can skip-on-duplicate without a race.
  // createMany with skipDuplicates is not supported on SQLite/libSQL, so
  // we do a manual filter + create-many.
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
    // Clear relations in CartItem/OrderItem (the FK is SET NULL) before delete.
    // Order snapshot fields (variantSku + variantAttributes) are preserved so
    // past orders still show which variant the customer ordered.
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
    return { ok: false, error: "Could not delete the variant" };
  }
}
