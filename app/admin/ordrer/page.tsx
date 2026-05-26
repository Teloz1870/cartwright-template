import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { formatPriceDkk } from "@/lib/format";

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "short",
});

const statusLabels: Record<string, string> = {
  pending: "Afventer",
  paid: "Betalt",
  shipped: "Afsendt",
  cancelled: "Annulleret",
};

export default async function AdminOrdersPage() {
  await requireAdmin();

  const orders = await prisma.order.findMany({
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-black text-sol-ink">Ordrer</h1>

      <section className="sol-card-elevated">
        {orders.length === 0 ? (
          <p className="px-5 py-8 text-sm font-semibold text-sol-muted">
            Ingen ordrer endnu.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-sol-cream/70 text-xs uppercase text-sol-muted">
                <tr>
                  <th className="px-5 py-3 font-black">Ordrenr.</th>
                  <th className="px-5 py-3 font-black">Dato</th>
                  <th className="px-5 py-3 font-black">Email</th>
                  <th className="px-5 py-3 font-black">Status</th>
                  <th className="px-5 py-3 text-right font-black">Antal varer</th>
                  <th className="px-5 py-3 text-right font-black">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sol-ink/10">
                {orders.map((order) => {
                  const itemCount = order.items.reduce(
                    (sum, item) => sum + item.quantity,
                    0,
                  );

                  return (
                    <tr key={order.id}>
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/ordrer/${order.id}`}
                          className="font-bold text-sol-ink underline decoration-sol-accent/40 underline-offset-4 transition hover:text-sol-accent"
                        >
                          {order.id}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-sol-muted">
                        {dateFormatter.format(order.createdAt)}
                      </td>
                      <td className="px-5 py-3 font-semibold text-sol-ink">
                        {order.email}
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex rounded-full bg-sol-sun/30 px-3 py-1 text-xs font-bold text-sol-ink">
                          {statusLabels[order.status] ?? order.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-sol-muted">
                        {itemCount}
                      </td>
                      <td className="px-5 py-3 text-right font-black text-sol-ink">
                        {formatPriceDkk(order.totalDkk)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
