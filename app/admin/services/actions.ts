"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

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

  const translationsRaw = formData.get("translations") as string;
  let translations = null;
  try {
    translations = translationsRaw ? JSON.parse(translationsRaw) : null;
  } catch (e) {
    console.error("Could not parse translations JSON", e);
  }

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
  } catch (error: any) {
    console.error("createService error", error);
    return { ok: false, error: "Der findes allerede en ydelse med denne slug." };
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

  const translationsRaw = formData.get("translations") as string;
  let translations = null;
  try {
    translations = translationsRaw ? JSON.parse(translationsRaw) : null;
  } catch (e) {
    console.error("Could not parse translations JSON", e);
  }

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
  } catch (error: any) {
    console.error("updateService error", error);
    return { ok: false, error: "Kunne ikke gemme ydelsen." };
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
    return { ok: false, error: "Kunne ikke slette ydelsen." };
  }
}
