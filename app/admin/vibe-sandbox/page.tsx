import { Suspense } from "react";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/brand";
import VibeSandboxClient from "./VibeSandboxClient";
import { AdminPageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function VibeSandboxPage() {
  await requireAdmin();

  const brand = await getBrand();
  const v0Enabled = Boolean(brand.features.v0Generator);

  const pages = await prisma.page.findMany({
    orderBy: { title: "asc" }
  });

  const formattedPages = pages.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    body: p.body,
    heroImage: p.heroImage,
    metaTitle: p.metaTitle,
    metaDescription: p.metaDescription,
    showInNav: p.showInNav,
    navOrder: p.navOrder,
    vibeHtml: p.vibeHtml,
    translations: (p.translations as { en?: { title?: string; body?: string; vibeHtml?: string } } | null) ?? null
  }));

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="AI Vibe Sandkasse"
        subtitle="Eksperimentel sandkasse til at previewe, teste og udgive rå HTML/Tailwind koder genereret af eksterne AI-designværktøjer."
      />
      <Suspense fallback={<div className="text-sm font-semibold text-sol-muted">Indlæser sandkasse...</div>}>
        <VibeSandboxClient pages={formattedPages} v0Enabled={v0Enabled} />
      </Suspense>
    </div>
  );
}
