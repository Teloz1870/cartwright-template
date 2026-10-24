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
import { categoryCountsWithLinks } from "@/lib/category-tree";
import { findCategoryLinks } from "@/lib/category-links";

export default async function AdminCategoriesPage() {
  await requireAdmin();

  const [categories, links] = await Promise.all([
    prisma.category.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: { name: "asc" },
    }),
    findCategoryLinks("admin/kategorier", null),
  ]);
  // WP2-r1′-b: a parent's page also lists its subcategories' products, so its
  // row reads "direct (total)". Categories without children — every category
  // of a flat shop — show their own count as before. WP2-r2′: both include
  // the products filed under the category as an extra one, each once.
  const { direct, withDescendants } = categoryCountsWithLinks(
    categories,
    new Map(categories.map((c) => [c.id, c._count.products])),
    links,
  );

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Categories"
        primaryAction={
          <AdminButton href="/admin/kategorier/nyt" variant="primary">
            + New category
          </AdminButton>
        }
      />

      <AdminCard padding="none">
        {categories.length === 0 ? (
          <EmptyState title="No categories yet." />
        ) : (
          <AdminTable minWidth="860px">
            <AdminThead>
              <tr>
                <AdminTh>Name</AdminTh>
                <AdminTh>Slug</AdminTh>
                <AdminTh align="right">Products</AdminTh>
                <AdminTh>Description</AdminTh>
                <AdminTh align="right">Actions</AdminTh>
              </tr>
            </AdminThead>
            <AdminTbody>
              {categories.map((category) => (
                <AdminTr key={category.id}>
                  <AdminTd className="font-black">{category.name}</AdminTd>
                  <AdminTd className="font-semibold text-sol-muted">{category.slug}</AdminTd>
                  <AdminTd align="right" className="font-semibold text-sol-muted">
                    {withDescendants.has(category.id) ? (
                      <span title="In this category (with its subcategories)">
                        {`${direct.get(category.id)} (${withDescendants.get(category.id)})`}
                      </span>
                    ) : (
                      direct.get(category.id)
                    )}
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
                        Edit
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
