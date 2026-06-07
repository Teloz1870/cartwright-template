import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { ScrapeForm } from "./ScrapeForm";

export const dynamic = "force-dynamic";

export default async function ScrapeProductPage() {
  await requireAdmin();
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-black text-sol-ink">Scrap produktdata</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
          Indtast en produkt-URL fra en eksisterende side → Firecrawl henter siden →
          AI udtrækker navn, beskrivelse, pris, attributter og billeder → gennemse og
          opret produktet.
        </p>
      </header>
      <ScrapeForm categories={categories} />
    </div>
  );
}
