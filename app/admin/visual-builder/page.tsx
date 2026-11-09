import { notFound } from "next/navigation";
import { brand } from "@/brand.config";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import VisualBuilderClient from "./VisualBuilderClient";

/**
 * Visual Builder — admin entry. Dobbelt-gated: requireAdmin() + compile-time
 * feature flag. With the flag off (all canaries) the route 404s, so it is invisible
 * and inert. Loads CMS pages (info/[slug]) that the builder can edit.
 */
export default async function VisualBuilderPage() {
  await requireAdmin();
  if (!brand.features.visualBuilderEnabled) notFound();

  const pages = await prisma.page.findMany({
    orderBy: { title: "asc" },
    select: { slug: true, title: true },
  });

  return (
    <VisualBuilderClient
      pages={pages}
      defaultLocale={brand.defaultLocale}
      magicBuilder={brand.features.magicBuilder}
    />
  );
}
