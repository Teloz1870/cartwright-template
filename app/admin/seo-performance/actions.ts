"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { geoShareOfVoice, defaultGeoPrompts } from "@/lib/seo/geo-tracker";

export async function getSeoOverview() {
  await requireAdmin();
  const [geo, experiments] = await Promise.all([
    prisma.geoSnapshot.findMany({ orderBy: { capturedAt: "desc" }, take: 30 }),
    prisma.seoExperiment.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
  ]);
  const recent = geo.slice(0, 10);
  const citedCount = recent.filter((g) => g.cited).length;
  return {
    geo,
    experiments,
    shareOfVoice: recent.length ? Math.round((citedCount / recent.length) * 100) : null,
  };
}

export async function runGeoNow(): Promise<{ cited: number; total: number }> {
  await requireAdmin();
  const r = await geoShareOfVoice(defaultGeoPrompts());
  revalidatePath("/admin/seo-performance");
  return r;
}
