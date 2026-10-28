"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

export async function listZones() {
  await requireAdmin();
  return prisma.shippingZone.findMany({
    orderBy: { createdAt: "asc" },
    include: { rates: { orderBy: { feeDkk: "asc" } } },
  });
}

export async function createZone(name: string, countriesCsv: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const countries = countriesCsv
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
  if (!name.trim() || countries.length === 0) return { ok: false, error: "Name + at least one country code (ISO-2)." };
  await prisma.shippingZone.create({ data: { name: name.trim(), countries: JSON.stringify(countries) } });
  revalidatePath("/admin/shipping");
  return { ok: true };
}

export async function deleteZone(id: string): Promise<{ ok: boolean }> {
  await requireAdmin();
  await prisma.shippingZone.delete({ where: { id } });
  revalidatePath("/admin/shipping");
  return { ok: true };
}

export type RateInput = {
  zoneId: string;
  name: string;
  feeKr: number;
  freeThresholdKr?: number;
  deliveryDaysMin: number;
  deliveryDaysMax: number;
};

export async function createRate(input: RateInput): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!input.name.trim() || !Number.isFinite(input.feeKr) || input.feeKr < 0) {
    return { ok: false, error: "Name + a valid price." };
  }
  await prisma.shippingRate.create({
    data: {
      zoneId: input.zoneId,
      name: input.name.trim(),
      feeDkk: Math.round(input.feeKr * 100),
      freeThresholdDkk: input.freeThresholdKr && input.freeThresholdKr > 0 ? Math.round(input.freeThresholdKr * 100) : null,
      deliveryDaysMin: Math.max(0, Math.round(input.deliveryDaysMin)),
      deliveryDaysMax: Math.max(0, Math.round(input.deliveryDaysMax)),
    },
  });
  revalidatePath("/admin/shipping");
  return { ok: true };
}

export async function deleteRate(id: string): Promise<{ ok: boolean }> {
  await requireAdmin();
  await prisma.shippingRate.delete({ where: { id } });
  revalidatePath("/admin/shipping");
  return { ok: true };
}
