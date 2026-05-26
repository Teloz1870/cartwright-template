import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import DeletePageButton from "@/components/admin/DeletePageButton";

export default async function AdminPagesPage() {
  await requireAdmin();

  const pages = await prisma.page.findMany({
    orderBy: { slug: "asc" },
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-black text-sol-ink">Sider</h1>
        <Link
          href="/admin/sider/nyt"
          className="rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:brightness-95"
        >
          + Ny side
        </Link>
      </div>

      <section className="sol-card-elevated">
        {pages.length === 0 ? (
          <p className="px-5 py-8 text-sm font-semibold text-sol-muted">
            Ingen sider endnu.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-sol-cream/70 text-xs uppercase text-sol-muted">
                <tr>
                  <th className="px-5 py-3 font-black">Slug</th>
                  <th className="px-5 py-3 font-black">Titel</th>
                  <th className="px-5 py-3 font-black">Sidst opdateret</th>
                  <th className="px-5 py-3 text-right font-black">Handlinger</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sol-ink/10">
                {pages.map((page) => (
                  <tr key={page.id}>
                    <td className="px-5 py-3 font-semibold text-sol-muted">{page.slug}</td>
                    <td className="px-5 py-3 font-black text-sol-ink">{page.title}</td>
                    <td className="px-5 py-3 text-sol-muted">
                      {new Intl.DateTimeFormat("da-DK", {
                        dateStyle: "short",
                      }).format(page.updatedAt)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/sider/${page.id}`}
                          className="rounded-lg border border-sol-ink/15 px-3 py-1.5 text-xs font-black text-sol-ink transition hover:border-sol-accent hover:text-sol-accent"
                        >
                          Rediger
                        </Link>
                        <DeletePageButton id={page.id} />
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
