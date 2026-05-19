import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import PageForm from "@/components/admin/PageForm";

type EditPagePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditPagePage({ params }: EditPagePageProps) {
  await requireAdmin();

  const { id } = await params;

  const page = await prisma.page.findUnique({
    where: { id },
  });

  if (!page) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-black text-sol-ink">Rediger side</h1>
      <PageForm
        page={{
          id: page.id,
          slug: page.slug,
          title: page.title,
          body: page.body,
        }}
      />
    </div>
  );
}
