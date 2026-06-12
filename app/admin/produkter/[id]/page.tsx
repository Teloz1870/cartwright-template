import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getFeatures } from "@/lib/brand";
import ProductForm from "@/components/admin/ProductForm";
import { AdminPageHeader } from "@/components/admin/ui";

type EditProductPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditProductPage({ params }: EditProductPageProps) {
  await requireAdmin();

  const { id } = await params;

  const [product, categories, features] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        // Task B: load variants så VariantsAdmin kan render tabellen.
        variants: { orderBy: { sku: "asc" } },
      },
    }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
    }),
    getFeatures(),
  ]);

  if (!product) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Rediger produkt"
        breadcrumb={[{ label: "Produkter", href: "/admin/produkter" }]}
      />
      <ProductForm
        aeoEnabled={Boolean(features.aeoContent)}
        categories={categories.map((category) => ({
          id: category.id,
          name: category.name,
        }))}
        product={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          description: product.description,
          priceDkk: product.priceDkk,
          images: product.images,
          stock: product.stock,
          videoUrl: product.videoUrl,
          videoGenerationId: product.videoGenerationId,
          // P1.2: ProductForm-typen er udvidet til string | null efter schema-skift
          frameColor: product.frameColor,
          lensColor: product.lensColor,
          brand: product.brand,
          // (TypeScript narrowing håndteres af opdateret ProductFormProduct-type)
          featured: product.featured,
          categoryId: product.categoryId,
          attributes: product.attributes as Record<string, unknown> | null,
          // AEO (answer-first) felter — gated på aeoContent.
          answerSummary: product.answerSummary,
          faq: product.faq,
          useCases: product.useCases,
          comparisonFacts: product.comparisonFacts,
          variants: product.variants.map((v) => ({
            id: v.id,
            sku: v.sku,
            priceDkk: v.priceDkk,
            stock: v.stock,
            attributes: (v.attributes ?? {}) as Record<string, string>,
          })),
        }}
      />
    </div>
  );
}
