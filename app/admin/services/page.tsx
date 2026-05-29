import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Plus, Edit } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminServicesPage() {
  await requireAdmin();

  const services = await prisma.service.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black text-sol-ink">Ydelser (Services)</h1>
        <Link
          href="/admin/services/new"
          className="flex items-center gap-2 rounded-full bg-sol-accent px-5 py-2.5 text-sm font-bold text-white transition hover:bg-sol-accent/90 shadow-md"
        >
          <Plus className="h-4 w-4" /> Opret Ydelse
        </Link>
      </div>

      <div className="rounded-xl border border-sol-ink/10 bg-sol-sand overflow-hidden">
        {services.length === 0 ? (
          <div className="p-8 text-center text-sol-muted">
            Der er ingen ydelser endnu.
          </div>
        ) : (
          <table className="w-full text-left text-sm text-sol-ink">
            <thead className="bg-sol-cream border-b border-sol-ink/10">
              <tr>
                <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs">Ydelse</th>
                <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs hidden sm:table-cell">Slug</th>
                <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs hidden md:table-cell">Pris (Tekst)</th>
                <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs text-right">Handling</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sol-ink/5">
              {services.map((service) => (
                <tr key={service.id} className="hover:bg-sol-cream/50 transition">
                  <td className="px-6 py-4 font-semibold text-sol-ink">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-sol-accent"></div>
                      {service.title}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sol-muted hidden sm:table-cell font-mono text-xs">
                    /{service.slug}
                  </td>
                  <td className="px-6 py-4 text-sol-muted hidden md:table-cell">
                    {service.priceString || "-"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/admin/services/${service.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sol-ink/10 bg-white px-3 py-1.5 text-xs font-bold text-sol-ink hover:bg-sol-cream hover:border-sol-ink/20 transition"
                    >
                      <Edit className="h-3.5 w-3.5" />
                      Rediger
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
