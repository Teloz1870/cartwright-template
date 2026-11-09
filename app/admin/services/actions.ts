"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Prisma } from "@/app/generated/prisma/client";

/**
 * The `translations` the form posted. ServiceForm posts none — a service's
 * English copy is edited in /admin/translations — so an absent (or unreadable)
 * field is `undefined` and Prisma leaves the column alone; writing null here
 * wiped that copy on every save in /admin/services. A posted empty field clears.
 */
function postedTranslations(formData: FormData): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (!formData.has("translations")) return undefined;
  const raw = formData.get("translations") as string;
  try {
    return (raw ? JSON.parse(raw) : null) ?? Prisma.JsonNull;
  } catch (e) {
    console.error("Could not parse translations JSON", e);
    return undefined;
  }
}

export async function createService(formData: FormData) {
  await requireAdmin();

  const title = formData.get("title") as string;
  const slug = formData.get("slug") as string;
  const shortDescription = formData.get("shortDescription") as string;
  const priceString = formData.get("priceString") as string;
  const heroImage = formData.get("heroImage") as string;
  const body = formData.get("body") as string;
  const showInNav = formData.get("showInNav") === "on";
  const navOrder = parseInt(formData.get("navOrder") as string) || 0;
  
  const featuresRaw = formData.get("features") as string;
  let features = [];
  try {
    features = JSON.parse(featuresRaw || "[]");
  } catch (e) {
    console.error("Could not parse features JSON", e);
  }

  const translations = postedTranslations(formData);

  try {
    await prisma.service.create({
      data: {
        title,
        slug,
        shortDescription,
        priceString,
        heroImage,
        body,
        features,
        showInNav,
        navOrder,
        translations,
      },
    });

    revalidatePath("/admin/services");
    revalidatePath("/", "layout");
  } catch (error: unknown) {
    console.error("createService error", error);
    return { ok: false, error: "A service with this slug already exists." };
  }

  redirect("/admin/services");
}

export async function updateService(id: string, formData: FormData) {
  await requireAdmin();

  const title = formData.get("title") as string;
  const slug = formData.get("slug") as string;
  const shortDescription = formData.get("shortDescription") as string;
  const priceString = formData.get("priceString") as string;
  const heroImage = formData.get("heroImage") as string;
  const body = formData.get("body") as string;
  const showInNav = formData.get("showInNav") === "on";
  const navOrder = parseInt(formData.get("navOrder") as string) || 0;
  
  const featuresRaw = formData.get("features") as string;
  let features = [];
  try {
    features = JSON.parse(featuresRaw || "[]");
  } catch (e) {
    console.error("Could not parse features JSON", e);
  }

  const translations = postedTranslations(formData);

  try {
    await prisma.service.update({
      where: { id },
      data: {
        title,
        slug,
        shortDescription,
        priceString,
        heroImage,
        body,
        features,
        showInNav,
        navOrder,
        translations,
      },
    });

    revalidatePath("/admin/services");
    revalidatePath("/", "layout");
  } catch (error: unknown) {
    console.error("updateService error", error);
    return { ok: false, error: "Could not save the service." };
  }

  return { ok: true };
}

export async function deleteService(id: string) {
  await requireAdmin();

  try {
    await prisma.service.delete({
      where: { id },
    });
    revalidatePath("/admin/services");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    console.error("deleteService error", error);
    return { ok: false, error: "Could not delete the service." };
  }
}
