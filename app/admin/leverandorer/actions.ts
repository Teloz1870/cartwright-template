"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

export async function listSuppliers() {
  await requireAdmin();
  return prisma.supplier.findMany({ orderBy: { name: "asc" } });
}

export async function createSupplier(
  name: string,
  email: string,
  mode: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!name.trim()) return { ok: false, error: "Navn er påkrævet." };
  const m = mode === "email" ? "email" : "manual";
  if (m === "email" && !email.trim()) return { ok: false, error: "Email-mode kræver en email." };
  await prisma.supplier.create({
    data: { name: name.trim(), email: email.trim() || null, mode: m },
  });
  revalidatePath("/admin/leverandorer");
  return { ok: true };
}

export async function deleteSupplier(id: string): Promise<{ ok: boolean }> {
  await requireAdmin();
  await prisma.supplier.delete({ where: { id } });
  revalidatePath("/admin/leverandorer");
  return { ok: true };
}
