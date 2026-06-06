import Link from "next/link";
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
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h1 className="text-3xl font-black text-sol-ink">Rediger side</h1>
        <Link
          href={`/admin/vibe-sandbox?id=${page.id}`}
          className="rounded-lg border border-sol-accent px-4 py-2 text-sm font-black text-sol-accent hover:bg-sol-accent/5 transition"
        >
          Åbn i Vibe Sandkasse
        </Link>
      </div>
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
