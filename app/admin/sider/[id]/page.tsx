import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import PageForm from "@/components/admin/PageForm";
import { AdminPageHeader, AdminButton } from "@/components/admin/ui";

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
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Rediger side"
        breadcrumb={[{ label: "Sider", href: "/admin/sider" }]}
        secondaryActions={
          <AdminButton
            href={`/admin/vibe-sandbox?id=${page.id}`}
            variant="secondary"
            size="sm"
          >
            Åbn i Vibe Sandkasse
          </AdminButton>
        }
      />
      <PageForm
        page={{
          id: page.id,
          slug: page.slug,
          title: page.title,
          body: page.body,
          heroImage: page.heroImage,
          metaTitle: page.metaTitle,
          metaDescription: page.metaDescription,
          showInNav: page.showInNav,
          navOrder: page.navOrder,
        }}
      />
    </div>
  );
}
