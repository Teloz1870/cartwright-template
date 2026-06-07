import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/ui";
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
      <AdminPageHeader
        title="Scrap produktdata"
        breadcrumb={[{ label: "Produkter", href: "/admin/produkter" }]}
        subtitle="Indtast en produkt-URL fra en eksisterende side → Firecrawl henter siden → AI udtrækker navn, beskrivelse, pris, attributter og billeder → gennemse og opret produktet."
      />
      <ScrapeForm categories={categories} />
    </div>
  );
}
