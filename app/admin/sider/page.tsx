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
import DeletePageButton from "@/components/admin/DeletePageButton";

export default async function AdminPagesPage() {
  await requireAdmin();

  const pages = await prisma.page.findMany({
    orderBy: { slug: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Sider"
        primaryAction={
          <AdminButton href="/admin/sider/nyt" variant="primary">
            + Ny side
          </AdminButton>
        }
      />

      <AdminCard padding="none">
        {pages.length === 0 ? (
          <EmptyState title="Ingen sider endnu." />
        ) : (
          <AdminTable minWidth="860px">
            <AdminThead>
              <tr>
                <AdminTh>Slug</AdminTh>
                <AdminTh>Titel</AdminTh>
                <AdminTh>Sidst opdateret</AdminTh>
                <AdminTh align="right">Handlinger</AdminTh>
              </tr>
            </AdminThead>
            <AdminTbody>
              {pages.map((page) => (
                <AdminTr key={page.id}>
                  <AdminTd className="font-semibold text-sol-muted">{page.slug}</AdminTd>
                  <AdminTd className="font-black">{page.title}</AdminTd>
                  <AdminTd className="text-sol-muted">
                    {new Intl.DateTimeFormat("da-DK", {
                      dateStyle: "short",
                    }).format(page.updatedAt)}
                  </AdminTd>
                  <AdminTd>
                    <div className="flex justify-end gap-2">
                      <AdminButton
                        href={`/admin/sider/${page.id}`}
                        variant="secondary"
                        size="sm"
                      >
                        Rediger
                      </AdminButton>
                      <DeletePageButton id={page.id} />
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
