import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getFeatures } from "@/lib/brand";
import ProductForm from "@/components/admin/ProductForm";
import { AdminPageHeader } from "@/components/admin/ui";

export default async function NewProductPage() {
  await requireAdmin();

  const [categories, features] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    getFeatures(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Nyt produkt"
        breadcrumb={[{ label: "Produkter", href: "/admin/produkter" }]}
      />
      <ProductForm
        aeoEnabled={Boolean(features.aeoContent)}
        categories={categories.map((category) => ({
          id: category.id,
          name: category.name,
        }))}
      />
    </div>
  );
}
