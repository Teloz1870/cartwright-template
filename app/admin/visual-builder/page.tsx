import { notFound } from "next/navigation";
import { brand } from "@/brand.config";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import VisualBuilderClient from "./VisualBuilderClient";

/**
 * Visual Builder — admin entry. Dobbelt-gated: requireAdmin() + compile-time
 * feature-flag. Med flag off (alle canaries) 404'er ruten, så den er usynlig
 * og inert. Loader CMS-sider (info/[slug]) som builderen kan redigere.
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
