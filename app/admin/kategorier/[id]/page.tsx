import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import CategoryForm from "@/components/admin/CategoryForm";

type EditCategoryPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditCategoryPage({ params }: EditCategoryPageProps) {
  await requireAdmin();

  const { id } = await params;

  const category = await prisma.category.findUnique({
    where: { id },
  });

  if (!category) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-black text-sol-ink">Rediger kategori</h1>
      <CategoryForm
        category={{
          id: category.id,
          name: category.name,
          slug: category.slug,
          description: category.description,
          heroImage: category.heroImage,
          heroVideo: category.heroVideo,
          descriptionLong: category.descriptionLong,
          metaTitle: category.metaTitle,
          metaDescription: category.metaDescription,
          faq: category.faq,
        }}
      />
    </div>
  );
}
