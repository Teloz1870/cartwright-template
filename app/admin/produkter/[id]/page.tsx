import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import ProductForm from "@/components/admin/ProductForm";

type EditProductPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditProductPage({ params }: EditProductPageProps) {
  await requireAdmin();

  const { id } = await params;

  const [product, categories] = await Promise.all([
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
  ]);

  if (!product) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-black text-sol-ink">Rediger produkt</h1>
      <ProductForm
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
          // P1.2: ProductForm-typen er udvidet til string | null efter schema-skift
          frameColor: product.frameColor,
          lensColor: product.lensColor,
          brand: product.brand,
          // (TypeScript narrowing håndteres af opdateret ProductFormProduct-type)
          featured: product.featured,
          categoryId: product.categoryId,
          attributes: product.attributes as Record<string, unknown> | null,
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
