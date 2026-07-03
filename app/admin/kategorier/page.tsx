import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  EmptyState,
  AdminTable,
  AdminThead,
  AdminTh,
  AdminTbody,
  AdminTr,
  AdminTd,
} from "@/components/admin/ui";
import DeleteCategoryButton from "@/components/admin/DeleteCategoryButton";

export default async function AdminCategoriesPage() {
  await requireAdmin();

  const categories = await prisma.category.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Kategorier"
        primaryAction={
          <AdminButton href="/admin/kategorier/nyt" variant="primary">
            + Ny kategori
          </AdminButton>
        }
      />

      <AdminCard padding="none">
        {categories.length === 0 ? (
          <EmptyState title="Ingen kategorier endnu." />
        ) : (
          <AdminTable minWidth="860px">
            <AdminThead>
              <tr>
                <AdminTh>Navn</AdminTh>
                <AdminTh>Slug</AdminTh>
                <AdminTh align="right">Antal produkter</AdminTh>
                <AdminTh>Beskrivelse</AdminTh>
                <AdminTh align="right">Handlinger</AdminTh>
              </tr>
            </AdminThead>
            <AdminTbody>
              {categories.map((category) => (
                <AdminTr key={category.id}>
                  <AdminTd className="font-black">{category.name}</AdminTd>
                  <AdminTd className="font-semibold text-sol-muted">{category.slug}</AdminTd>
                  <AdminTd align="right" className="font-semibold text-sol-muted">
                    {category._count.products}
                  </AdminTd>
                  <AdminTd className="text-sol-muted">
                    {category.description
                      ? category.description.slice(0, 60) +
                        (category.description.length > 60 ? "…" : "")
                      : "—"}
                  </AdminTd>
                  <AdminTd>
                    <div className="flex justify-end gap-2">
                      <AdminButton
                        href={`/admin/kategorier/${category.id}`}
                        variant="secondary"
                        size="sm"
                      >
                        Rediger
                      </AdminButton>
                      <DeleteCategoryButton id={category.id} />
                    </div>
                  </AdminTd>
                </AdminTr>
              ))}
            </AdminTbody>
          </AdminTable>
        )}
      </AdminCard>
    </div>
  );
}
