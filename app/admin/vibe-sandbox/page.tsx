import { Suspense } from "react";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import VibeSandboxClient from "./VibeSandboxClient";

export const dynamic = "force-dynamic";

export default async function VibeSandboxPage() {
  await requireAdmin();
  
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
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-black text-sol-ink">AI Vibe Sandkasse</h1>
        <p className="text-sm font-semibold text-sol-muted max-w-xl">
          Eksperimentel sandkasse til at previewe, teste og udgive rå HTML/Tailwind koder genereret af eksterne AI-designværktøjer.
        </p>
      </div>
      <Suspense fallback={<div className="text-sm font-semibold text-sol-muted">Indlæser sandkasse...</div>}>
        <VibeSandboxClient pages={formattedPages} />
      </Suspense>
    </div>
  );
}
