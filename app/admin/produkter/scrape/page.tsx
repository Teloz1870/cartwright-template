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
        title="Scrape product data"
        breadcrumb={[{ label: "Products", href: "/admin/produkter" }]}
        subtitle="Enter a product URL from an existing page → Firecrawl fetches the page → AI extracts name, description, price, attributes and images → review and create the product."
      />
      <ScrapeForm categories={categories} />
    </div>
  );
}
