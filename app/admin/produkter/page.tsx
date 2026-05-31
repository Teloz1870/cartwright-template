import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
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
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-black text-sol-ink">Produkter</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/produkter/scrape"
            className="rounded-lg border border-sol-ink/15 px-3 py-2 text-sm font-black text-sol-ink transition hover:border-sol-accent hover:text-sol-accent"
          >
            Scrap produktdata
          </Link>
          <a
            href="/admin/produkter/export"
            className="rounded-lg border border-sol-ink/15 px-3 py-2 text-sm font-black text-sol-ink transition hover:border-sol-accent hover:text-sol-accent"
          >
            Eksportér CSV
          </a>
          <Link
            href="/admin/produkter/import"
            className="rounded-lg border border-sol-ink/15 px-3 py-2 text-sm font-black text-sol-ink transition hover:border-sol-accent hover:text-sol-accent"
          >
            Importér CSV
          </Link>
          <Link
            href="/admin/produkter/nyt"
            className="rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:brightness-95"
          >
            + Nyt produkt
          </Link>
        </div>
      </div>

      <section className="sol-card-elevated p-3">
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-sm font-semibold text-sol-muted">
            Ingen produkter endnu.
          </p>
        ) : (
          <BulkProductTable products={rows} categories={categories} />
        )}
      </section>
    </div>
  );
}
