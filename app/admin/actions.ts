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
import { Prisma } from "@/app/generated/prisma/client";
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
    // AEO (answer-first) fields — gated on brand.features.aeoContent in the UI,
    // but always parsed (lossless): empty fields → null.
    answerSummary: formData.get("answerSummary"),
    faq: formData.get("faq"),
    useCases: formData.get("useCases"),
    comparisonFacts: formData.get("comparisonFacts"),
    translations: formData.get("translations"),
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
  return { ok: false, error: "Something went wrong. Try again." };
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
        // P1.2: empty string → null so DB columns stay NULL for non-eyewear
        frameColor: data.frameColor || null,
        lensColor: data.lensColor || null,
        brand: data.brand || null,
        featured: data.featured,
        categoryId: data.categoryId,
        images,
        attributes: data.attributes ?? undefined,
        answerSummary: data.answerSummary?.trim() || null,
        faq: data.faq?.trim() || null,
        useCases: data.useCases ?? undefined,
        comparisonFacts: data.comparisonFacts ?? undefined,
        translations: data.translations ?? undefined,
      },
    });

    revalidatePath("/admin/produkter");

    return { ok: true, id: product.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "A product with this slug already exists" };
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
        // P1.2: empty string → null so DB columns stay NULL for non-eyewear
        frameColor: data.frameColor || null,
        lensColor: data.lensColor || null,
        brand: data.brand || null,
        featured: data.featured,
        categoryId: data.categoryId,
        images,
        // Null = clear attributes (the admin emptied the field); object = update.
        attributes: data.attributes ?? Prisma.JsonNull,
        // AEO fields: empty → null/JsonNull (clear), otherwise store the value.
        answerSummary: data.answerSummary?.trim() || null,
        faq: data.faq?.trim() || null,
        useCases: data.useCases ?? Prisma.JsonNull,
        comparisonFacts: data.comparisonFacts ?? Prisma.JsonNull,
        translations: data.translations ?? Prisma.JsonNull,
      },
    });

    revalidatePath("/admin/produkter");
    revalidatePath("/produkter");
    revalidatePath("/");

    return { ok: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "A product with this slug already exists" };
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return { ok: false, error: "Product not found" };
    }

    return fallbackError(err);
  }
}

/**
 * Deletes a product via the tool layer — gets soft-delete + audit log
 * + revertability. This used to be a direct prisma.product.delete()
 * that hard-deleted without an audit trail (review finding #2).
 */
export async function deleteProduct(id: string): Promise<ActionResult> {
  const session = await requireAdmin();

  // Look up the slug from the id — the tool identifies by slug, not id
  const product = await prisma.product.findUnique({
    where: { id },
    select: { slug: true },
  });
  if (!product) return { ok: false, error: "Product not found" };

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
      return { ok: false, error: "Invalid order status" };
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { status },
    });

    revalidatePath("/admin/ordrer");

    return { ok: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return { ok: false, error: "Order not found" };
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
      return { ok: false, error: "A discount code with this code already exists" };
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
      return { ok: false, error: "Discount code not found" };
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
      translations: formData.get("translations"),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Ugyldige sidedata" };
    }

    const data = parsed.data;
    const showInNav = formData.get("showInNav") === "on";
    const navOrder = parseInt(String(formData.get("navOrder") ?? "0"), 10) || 0;
    const heroImage = formData.get("heroImage")?.toString()?.trim() || null;
    const metaTitle = formData.get("metaTitle")?.toString()?.trim() || null;
    const metaDescription = formData.get("metaDescription")?.toString()?.trim() || null;
    const vibeHtml = formData.get("vibeHtml")?.toString() || null;

    const page = await prisma.page.create({
      data: {
        slug: data.slug,
        title: data.title,
        body: data.body,
        heroImage,
        metaTitle,
        metaDescription,
        showInNav,
        navOrder,
        translations: data.translations ?? undefined,
        vibeHtml,
      },
    });

    revalidatePath("/admin/sider");
    revalidatePath("/info/" + data.slug);
    revalidatePath("/"); // revalidate header nav

    return { ok: true, id: page.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "A page with this slug already exists" };
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
      translations: formData.get("translations"),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Ugyldige sidedata" };
    }

    const data = parsed.data;
    const showInNav = formData.get("showInNav") === "on";
    const navOrder = parseInt(String(formData.get("navOrder") ?? "0"), 10) || 0;
    const heroImage = formData.get("heroImage")?.toString()?.trim() || null;
    const metaTitle = formData.get("metaTitle")?.toString()?.trim() || null;
    const metaDescription = formData.get("metaDescription")?.toString()?.trim() || null;
    const vibeHtml = formData.get("vibeHtml")?.toString() || null;

    await prisma.page.update({
      where: { id },
      data: {
        slug: data.slug,
        title: data.title,
        body: data.body,
        heroImage,
        metaTitle,
        metaDescription,
        showInNav,
        navOrder,
        translations: data.translations ?? Prisma.JsonNull,
        vibeHtml,
      },
    });

    revalidatePath("/admin/sider");
    revalidatePath("/info/" + data.slug);
    revalidatePath("/"); // revalidate header nav

    return { ok: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "A page with this slug already exists" };
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return { ok: false, error: "Page not found" };
    }

    return fallbackError(err);
  }
}

/**
 * Deletes a CMS page via the tool layer — gets an audit log automatically.
 * (Pages have no soft-delete in the current model — that is deliberate;
 * pages are rarely regretted and can always be recreated with the same slug.)
 */
export async function deletePage(id: string): Promise<ActionResult> {
  const session = await requireAdmin();

  const page = await prisma.page.findUnique({
    where: { id },
    select: { slug: true },
  });
  if (!page) return { ok: false, error: "Page not found" };

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
      translations: formData.get("translations"),
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
        // An empty string from the form is treated as null so the fallback mapping applies
        heroImage: data.heroImage?.trim() ? data.heroImage : null,
        heroVideo: data.heroVideo?.trim() ? data.heroVideo : null,
        metaTitle: data.metaTitle?.trim() ? data.metaTitle : null,
        metaDescription: data.metaDescription?.trim() ? data.metaDescription : null,
        descriptionLong: data.descriptionLong?.trim() ? data.descriptionLong : null,
        faq: data.faq?.trim() ? data.faq : null,
        translations: data.translations ?? undefined,
      },
    });

    revalidatePath("/admin/kategorier");
    revalidatePath("/category/" + data.slug);
    revalidatePath("/");

    return { ok: true, id: category.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "A category with this slug already exists" };
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
      translations: formData.get("translations"),
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
        translations: data.translations ?? Prisma.JsonNull,
      },
    });

    revalidatePath("/admin/kategorier");
    revalidatePath("/category/" + data.slug);
    revalidatePath("/");

    return { ok: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "A category with this slug already exists" };
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return { ok: false, error: "Category not found" };
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
  if (!cat) return { ok: false, error: "Category not found" };

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
