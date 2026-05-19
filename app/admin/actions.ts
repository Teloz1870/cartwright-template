"use server";

import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  productSchema,
  discountCodeSchema,
  pageSchema,
  categorySchema,
} from "@/lib/validation";
import { Prisma } from "@prisma/client";
import { invokeTool } from "@/lib/tools/registry";
import { ADMIN_CHAT_SCOPES } from "@/lib/scopes";

type ProductActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

type ActionResult = { ok: true } | { ok: false; error: string };

function productFormDataToObject(formData: FormData) {
  return {
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description"),
    priceKr: formData.get("priceKr"),
    stock: formData.get("stock"),
    frameColor: formData.get("frameColor"),
    lensColor: formData.get("lensColor"),
    brand: formData.get("brand"),
    categoryId: formData.get("categoryId"),
    featured: formData.get("featured"),
    images: formData.get("images"),
    attributes: formData.get("attributes"),
  };
}

function parseImages(images: string) {
  return JSON.stringify(
    images
      .split(/[,\n]/)
      .map((image) => image.trim())
      .filter(Boolean),
  );
}

function fallbackError(error: unknown): { ok: false; error: string } {
  console.error(error);
  return { ok: false, error: "Der opstod en fejl. Prøv igen." };
}

export async function createProduct(
  formData: FormData,
): Promise<ProductActionResult> {
  await requireAdmin();

  try {
    const parsed = productSchema.safeParse(productFormDataToObject(formData));

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Ugyldige produktdata" };
    }

    const data = parsed.data;
    const priceDkk = Math.round(data.priceKr * 100);
    const images = parseImages(data.images);

    const product = await prisma.product.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        priceDkk,
        stock: data.stock,
        // P1.2: tom-string → null så DB-kolonner forbliver NULL for non-eyewear
        frameColor: data.frameColor || null,
        lensColor: data.lensColor || null,
        brand: data.brand || null,
        featured: data.featured,
        categoryId: data.categoryId,
        images,
        attributes: data.attributes ?? undefined,
      },
    });

    revalidatePath("/admin/produkter");

    return { ok: true, id: product.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "Der findes allerede et produkt med dette slug" };
    }

    return fallbackError(err);
  }
}

export async function updateProduct(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  try {
    const parsed = productSchema.safeParse(productFormDataToObject(formData));

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Ugyldige produktdata" };
    }

    const data = parsed.data;
    const priceDkk = Math.round(data.priceKr * 100);
    const images = parseImages(data.images);

    await prisma.product.update({
      where: { id },
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        priceDkk,
        stock: data.stock,
        // P1.2: tom-string → null så DB-kolonner forbliver NULL for non-eyewear
        frameColor: data.frameColor || null,
        lensColor: data.lensColor || null,
        brand: data.brand || null,
        featured: data.featured,
        categoryId: data.categoryId,
        images,
        // Null = clear attributes (admin tømte feltet); object = update.
        attributes: data.attributes ?? Prisma.JsonNull,
      },
    });

    revalidatePath("/admin/produkter");
    revalidatePath("/produkter");
    revalidatePath("/");

    return { ok: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "Der findes allerede et produkt med dette slug" };
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return { ok: false, error: "Produktet blev ikke fundet" };
    }

    return fallbackError(err);
  }
}

/**
 * Sletter et produkt via tool-laget — får automatisk soft-delete + audit-log
 * + revertability. Tidligere var dette en direkte prisma.product.delete()
 * der hard-deletede uden audit-spor (review fund #2).
 */
export async function deleteProduct(id: string): Promise<ActionResult> {
  const session = await requireAdmin();

  // Slå slug op fra id — tool'et identificerer ved slug, ikke id
  const product = await prisma.product.findUnique({
    where: { id },
    select: { slug: true },
  });
  if (!product) return { ok: false, error: "Produktet blev ikke fundet" };

  const result = await invokeTool(
    "products.delete",
    { slug: product.slug, confirm: true },
    {
      actor: `user:${session.user.id}`,
      requestId: randomUUID(),
    },
    ADMIN_CHAT_SCOPES,
  );

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/produkter");
  revalidatePath("/changelog");
  return { ok: true };
}

export async function updateOrderStatus(
  orderId: string,
  status: string,
): Promise<ActionResult> {
  await requireAdmin();

  try {
    if (!["pending", "paid", "shipped", "cancelled"].includes(status)) {
      return { ok: false, error: "Ugyldig ordrestatus" };
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { status },
    });

    revalidatePath("/admin/ordrer");

    return { ok: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return { ok: false, error: "Ordren blev ikke fundet" };
    }

    return fallbackError(err);
  }
}

export async function createDiscountCode(
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  try {
    const parsed = discountCodeSchema.safeParse({
      code: formData.get("code"),
      type: formData.get("type"),
      value: formData.get("value"),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Ugyldige rabatcodedata" };
    }

    const data = parsed.data;
    const storedValue = data.type === "fixed" ? Math.round(data.value * 100) : data.value;

    await prisma.discountCode.create({
      data: {
        code: data.code,
        type: data.type,
        value: storedValue,
        active: true,
        usageCount: 0,
      },
    });

    revalidatePath("/admin/rabatkoder");

    return { ok: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "Der findes allerede en rabatkode med denne kode" };
    }

    return fallbackError(err);
  }
}

export async function toggleDiscountCode(id: string): Promise<ActionResult> {
  await requireAdmin();

  try {
    const current = await prisma.discountCode.findUnique({
      where: { id },
    });

    if (!current) {
      return { ok: false, error: "Rabatkoden blev ikke fundet" };
    }

    await prisma.discountCode.update({
      where: { id },
      data: { active: !current.active },
    });

    revalidatePath("/admin/rabatkoder");

    return { ok: true };
  } catch (err) {
    return fallbackError(err);
  }
}

export async function createPage(
  formData: FormData,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireAdmin();

  try {
    const parsed = pageSchema.safeParse({
      slug: formData.get("slug"),
      title: formData.get("title"),
      body: formData.get("body"),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Ugyldige sidedata" };
    }

    const data = parsed.data;

    const page = await prisma.page.create({
      data: {
        slug: data.slug,
        title: data.title,
        body: data.body,
      },
    });

    revalidatePath("/admin/sider");
    revalidatePath("/info/" + data.slug);

    return { ok: true, id: page.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "Der findes allerede en side med dette slug" };
    }

    return fallbackError(err);
  }
}

export async function updatePage(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  try {
    const parsed = pageSchema.safeParse({
      slug: formData.get("slug"),
      title: formData.get("title"),
      body: formData.get("body"),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Ugyldige sidedata" };
    }

    const data = parsed.data;

    await prisma.page.update({
      where: { id },
      data: {
        slug: data.slug,
        title: data.title,
        body: data.body,
      },
    });

    revalidatePath("/admin/sider");
    revalidatePath("/info/" + data.slug);

    return { ok: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "Der findes allerede en side med dette slug" };
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return { ok: false, error: "Siden blev ikke fundet" };
    }

    return fallbackError(err);
  }
}

/**
 * Sletter en CMS-side via tool-laget — får automatisk audit-log.
 * (Pages har ikke soft-delete i nuværende model — det er bevidst,
 * sider er sjældent fortrudt og kan altid genskabes med samme slug.)
 */
export async function deletePage(id: string): Promise<ActionResult> {
  const session = await requireAdmin();

  const page = await prisma.page.findUnique({
    where: { id },
    select: { slug: true },
  });
  if (!page) return { ok: false, error: "Siden blev ikke fundet" };

  const result = await invokeTool(
    "pages.delete",
    { slug: page.slug, confirm: true },
    { actor: `user:${session.user.id}`, requestId: randomUUID() },
    ADMIN_CHAT_SCOPES,
  );
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/sider");
  revalidatePath("/changelog");
  return { ok: true };
}

export async function createCategory(
  formData: FormData,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireAdmin();

  try {
    const parsed = categorySchema.safeParse({
      name: formData.get("name"),
      slug: formData.get("slug"),
      description: formData.get("description"),
      heroImage: formData.get("heroImage"),
      heroVideo: formData.get("heroVideo"),
      metaTitle: formData.get("metaTitle"),
      metaDescription: formData.get("metaDescription"),
      descriptionLong: formData.get("descriptionLong"),
      faq: formData.get("faq"),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Ugyldige kategoridata" };
    }

    const data = parsed.data;

    const category = await prisma.category.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description?.trim() ? data.description : null,
        // Empty-string fra form treats som null så fallback-mapping rammer
        heroImage: data.heroImage?.trim() ? data.heroImage : null,
        heroVideo: data.heroVideo?.trim() ? data.heroVideo : null,
        metaTitle: data.metaTitle?.trim() ? data.metaTitle : null,
        metaDescription: data.metaDescription?.trim() ? data.metaDescription : null,
        descriptionLong: data.descriptionLong?.trim() ? data.descriptionLong : null,
        faq: data.faq?.trim() ? data.faq : null,
      },
    });

    revalidatePath("/admin/kategorier");
    revalidatePath("/kategori/" + data.slug);
    revalidatePath("/");

    return { ok: true, id: category.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "Der findes allerede en kategori med dette slug" };
    }

    return fallbackError(err);
  }
}

export async function updateCategory(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  try {
    const parsed = categorySchema.safeParse({
      name: formData.get("name"),
      slug: formData.get("slug"),
      description: formData.get("description"),
      heroImage: formData.get("heroImage"),
      heroVideo: formData.get("heroVideo"),
      metaTitle: formData.get("metaTitle"),
      metaDescription: formData.get("metaDescription"),
      descriptionLong: formData.get("descriptionLong"),
      faq: formData.get("faq"),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Ugyldige kategoridata" };
    }

    const data = parsed.data;

    await prisma.category.update({
      where: { id },
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description?.trim() ? data.description : null,
        heroImage: data.heroImage?.trim() ? data.heroImage : null,
        heroVideo: data.heroVideo?.trim() ? data.heroVideo : null,
        metaTitle: data.metaTitle?.trim() ? data.metaTitle : null,
        metaDescription: data.metaDescription?.trim() ? data.metaDescription : null,
        descriptionLong: data.descriptionLong?.trim() ? data.descriptionLong : null,
        faq: data.faq?.trim() ? data.faq : null,
      },
    });

    revalidatePath("/admin/kategorier");
    revalidatePath("/kategori/" + data.slug);
    revalidatePath("/");

    return { ok: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "Der findes allerede en kategori med dette slug" };
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return { ok: false, error: "Kategorien blev ikke fundet" };
    }

    return fallbackError(err);
  }
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const session = await requireAdmin();

  const cat = await prisma.category.findUnique({
    where: { id },
    select: { slug: true },
  });
  if (!cat) return { ok: false, error: "Kategorien blev ikke fundet" };

  const result = await invokeTool(
    "categories.delete",
    { slug: cat.slug, confirm: true },
    { actor: `user:${session.user.id}`, requestId: randomUUID() },
    ADMIN_CHAT_SCOPES,
  );
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/kategorier");
  revalidatePath("/changelog");
  return { ok: true };
}
