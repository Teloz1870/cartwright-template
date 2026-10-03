import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import {
  AdminButton,
  AdminCard,
  AdminPageHeader,
  EmptyState,
} from "@/components/admin/ui";
import { BulkProductTable } from "./BulkProductTable";

export default async function AdminProductsPage() {
  await requireAdmin();

  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      include: { category: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const rows = products.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    brand: p.brand,
    categoryName: p.category.name,
    priceDkk: p.priceDkk,
    stock: p.stock,
    featured: p.featured,
  }));

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Products"
        secondaryActions={
          <>
            <AdminButton href="/admin/produkter/scrape" variant="secondary" size="sm">
              Scrape product data
            </AdminButton>
            <AdminButton href="/admin/produkter/export" variant="secondary" size="sm">
              Export CSV
            </AdminButton>
            <AdminButton href="/admin/produkter/import" variant="secondary" size="sm">
              Import CSV
            </AdminButton>
          </>
        }
        primaryAction={
          <AdminButton href="/admin/produkter/nyt" variant="primary">
            + New product
          </AdminButton>
        }
      />

      <AdminCard padding="none">
        {rows.length === 0 ? (
          <EmptyState
            title="No products yet."
            description="Create your first product to get started."
            action={
              <AdminButton href="/admin/produkter/nyt" variant="primary">
                + New product
              </AdminButton>
            }
          />
        ) : (
          <BulkProductTable products={rows} categories={categories} />
        )}
      </AdminCard>
    </div>
  );
}
