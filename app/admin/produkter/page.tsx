import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { formatPriceDkk } from "@/lib/format";
import DeleteProductButton from "@/components/admin/DeleteProductButton";

export default async function AdminProductsPage() {
  await requireAdmin();

  const products = await prisma.product.findMany({
    include: { category: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-black text-sol-ink">Produkter</h1>
        <Link
          href="/admin/produkter/nyt"
          className="rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:brightness-95"
        >
          + Nyt produkt
        </Link>
      </div>

      <section className="sol-card-elevated">
        {products.length === 0 ? (
          <p className="px-5 py-8 text-sm font-semibold text-sol-muted">
            Ingen produkter endnu.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-sol-cream/70 text-xs uppercase text-sol-muted">
                <tr>
                  <th className="px-5 py-3 font-black">Navn</th>
                  <th className="px-5 py-3 font-black">Brand</th>
                  <th className="px-5 py-3 font-black">Kategori</th>
                  <th className="px-5 py-3 text-right font-black">Pris</th>
                  <th className="px-5 py-3 text-right font-black">Lager</th>
                  <th className="px-5 py-3 text-center font-black">Fremhævet</th>
                  <th className="px-5 py-3 text-right font-black">Handlinger</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sol-ink/10">
                {products.map((product) => (
                  <tr key={product.id}>
                    <td className="px-5 py-3">
                      <div className="font-black text-sol-ink">{product.name}</div>
                      <div className="text-xs font-semibold text-sol-muted">{product.slug}</div>
                    </td>
                    <td className="px-5 py-3 font-semibold text-sol-ink">{product.brand}</td>
                    <td className="px-5 py-3 text-sol-muted">{product.category.name}</td>
                    <td className="px-5 py-3 text-right font-black text-sol-ink">
                      {formatPriceDkk(product.priceDkk)}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-sol-muted">
                      {product.stock}
                    </td>
                    <td className="px-5 py-3 text-center font-black text-sol-ink">
                      {product.featured ? "✓" : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/produkter/${product.id}`}
                          className="rounded-lg border border-sol-ink/15 px-3 py-1.5 text-xs font-black text-sol-ink transition hover:border-sol-accent hover:text-sol-accent"
                        >
                          Rediger
                        </Link>
                        <DeleteProductButton productId={product.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
