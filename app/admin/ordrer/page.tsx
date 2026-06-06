import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { getFeatures } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { formatPriceDkk } from "@/lib/format";
import { statusColor, statusLabel } from "@/lib/orders/status";
import { listOrdersPage } from "./actions";
import OrdersWorkspace from "@/components/admin/OrdersWorkspace";

const dateFormatter = new Intl.DateTimeFormat("da-DK", { dateStyle: "short" });

type Props = {
  searchParams: Promise<{
    tab?: string;
    q?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function AdminOrdersPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const features = await getFeatures();

  // Flag off → den gamle bare tabel (reversibelt at flippe flaget).
  if (!features.orderWorkspace) {
    const orders = await prisma.order.findMany({
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: 100,
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
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusColor(order.status)}`}
                          >
                            {statusLabel(order.status)}
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

  const tab = sp.tab ?? "all";
  const initial = await listOrdersPage({
    tab,
    q: sp.q,
    fromDate: sp.from,
    toDate: sp.to,
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-black text-sol-ink">Ordrer</h1>
      <OrdersWorkspace
        key={`${tab}|${sp.q ?? ""}|${sp.from ?? ""}|${sp.to ?? ""}`}
        initialRows={initial.rows}
        initialNextCursor={initial.nextCursor}
        filters={{
          tab,
          q: sp.q ?? "",
          from: sp.from ?? "",
          to: sp.to ?? "",
        }}
      />
    </div>
  );
}
