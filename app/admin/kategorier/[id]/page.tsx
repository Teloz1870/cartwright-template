import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import CategoryForm from "@/components/admin/CategoryForm";
import { AdminPageHeader } from "@/components/admin/ui";
import { readTranslations } from "@/lib/translated-field";

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
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Edit category"
        breadcrumb={[{ label: "Categories", href: "/admin/kategorier" }]}
      />
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
          // Without it the English fields start empty and a save posts them so.
          translations: readTranslations(category.translations) as Record<
            string,
            { name?: string; description?: string; descriptionLong?: string }
          > | null,
        }}
      />
    </div>
  );
}
