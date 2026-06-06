import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getFeatures } from "@/lib/brand";
import ProductForm from "@/components/admin/ProductForm";

export default async function NewProductPage() {
  await requireAdmin();

  const [categories, features] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    getFeatures(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-black text-sol-ink">Nyt produkt</h1>
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
