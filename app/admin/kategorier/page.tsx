import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import DeleteCategoryButton from "@/components/admin/DeleteCategoryButton";

export default async function AdminCategoriesPage() {
  await requireAdmin();

  const categories = await prisma.category.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-black text-sol-ink">Kategorier</h1>
        <Link
          href="/admin/kategorier/nyt"
          className="rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:brightness-95"
        >
          + Ny kategori
        </Link>
      </div>

      {/* Phase 8 Task C: admin-tabel-cards bruger sol-card-elevated for konsistent
          dybde med storefront-look (cream-tilt navy-shadow frem for flad sol-ink-border). */}
      <section className="sol-card-elevated overflow-hidden">
        {categories.length === 0 ? (
          <p className="px-5 py-8 text-sm font-semibold text-sol-muted">
            Ingen kategorier endnu.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-sol-cream/70 text-xs uppercase text-sol-muted">
                <tr>
                  <th className="px-5 py-3 font-black">Navn</th>
                  <th className="px-5 py-3 font-black">Slug</th>
                  <th className="px-5 py-3 text-right font-black">Antal produkter</th>
                  <th className="px-5 py-3 font-black">Beskrivelse</th>
                  <th className="px-5 py-3 text-right font-black">Handlinger</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sol-ink/10">
                {categories.map((category) => (
                  <tr key={category.id}>
                    <td className="px-5 py-3 font-black text-sol-ink">{category.name}</td>
                    <td className="px-5 py-3 font-semibold text-sol-muted">{category.slug}</td>
                    <td className="px-5 py-3 text-right font-semibold text-sol-muted">
                      {category._count.products}
                    </td>
                    <td className="px-5 py-3 text-sol-muted">
                      {category.description
                        ? category.description.slice(0, 60) +
                          (category.description.length > 60 ? "…" : "")
                        : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/kategorier/${category.id}`}
                          className="rounded-lg border border-sol-ink/15 px-3 py-1.5 text-xs font-black text-sol-ink transition hover:border-sol-accent hover:text-sol-accent"
                        >
                          Rediger
                        </Link>
                        <DeleteCategoryButton id={category.id} />
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
