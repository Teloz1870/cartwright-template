import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { formatPriceDkk } from "@/lib/format";

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "short",
});

export default async function AdminPage() {
  await requireAdmin();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    orderCount,
    revenue,
    productCount,
    lowStockCount,
    customerCount,
    recentOrders,
    aiActionsToday,
    chatSessionsToday,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.order.aggregate({
      _sum: { totalDkk: true },
      where: { status: { not: "cancelled" } },
    }),
    prisma.product.count({ where: { deletedAt: null } }),
    prisma.product.count({ where: { stock: { lte: 3 }, deletedAt: null } }),
    prisma.user.count({ where: { role: "customer" } }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        status: true,
        totalDkk: true,
        createdAt: true,
      },
    }),
    // AI-first metrics: hvor mange tool-kald fra ekstern AI/admin i dag
    prisma.auditLog.count({
      where: {
        createdAt: { gte: todayStart },
        actor: { startsWith: "apikey:" },
        ok: true,
      },
    }),
    // Unikke storefront-chat-sessioner i dag (groupBy på actor-streng)
    prisma.auditLog
      .findMany({
        where: {
          createdAt: { gte: todayStart },
          actor: { startsWith: "storefront-chat:" },
        },
        select: { actor: true },
        distinct: ["actor"],
      })
      .then((rows) => rows.length),
  ]);

  const stats = [
    { label: "Ordrer", value: orderCount.toString() },
    { label: "Omsætning", value: formatPriceDkk(revenue._sum.totalDkk ?? 0) },
    { label: "Produkter", value: productCount.toString() },
    { label: "Lavt lager", value: lowStockCount.toString() },
    { label: "Kunder", value: customerCount.toString() },
  ];

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-black text-sol-ink">Dashboard</h1>

      {/* AI-aktivitet i dag — sektion fremhævet med navy panel for at gøre
          AI-first-fortællingen synlig direkte i admin. */}
      <section className="rounded-2xl bg-sol-accent px-5 py-5 text-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-sol-sun">
              AI-first · i dag
            </p>
            <p className="mt-1 text-sm text-white/85">
              Driften styres af AI-klienter og kunde-chat — her er dagens aktivitet
            </p>
          </div>
          <Link
            href="/admin/audit"
            className="rounded-full bg-white/15 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-white/25"
          >
            Se fuld audit
          </Link>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-4xl font-black">{aiActionsToday}</p>
            <p className="mt-1 text-xs uppercase tracking-wider text-white/70">
              AI-handlinger via API
            </p>
          </div>
          <div>
            <p className="text-4xl font-black">{chatSessionsToday}</p>
            <p className="mt-1 text-xs uppercase tracking-wider text-white/70">
              Kunde-chat-sessioner
            </p>
          </div>
          <div>
            <p className="text-4xl font-black">
              {aiActionsToday + chatSessionsToday}
            </p>
            <p className="mt-1 text-xs uppercase tracking-wider text-white/70">
              Samlet AI-aktivitet
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-sol-ink/10 bg-white px-5 py-4 shadow-sm"
          >
            <p className="text-3xl font-black text-sol-ink">{stat.value}</p>
            <p className="mt-1 text-sm font-semibold text-sol-muted">
              {stat.label}
            </p>
          </div>
        ))}
      </section>

      <section className="sol-card-elevated">
        <div className="border-b border-sol-ink/10 px-5 py-4">
          <h2 className="text-xl font-black text-sol-ink">Seneste ordrer</h2>
        </div>

        {recentOrders.length === 0 ? (
          <p className="px-5 py-8 text-sm font-semibold text-sol-muted">
            Ingen ordrer endnu.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-sol-cream/70 text-xs uppercase text-sol-muted">
                <tr>
                  <th className="px-5 py-3 font-black">Ordre</th>
                  <th className="px-5 py-3 font-black">Dato</th>
                  <th className="px-5 py-3 font-black">Status</th>
                  <th className="px-5 py-3 text-right font-black">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sol-ink/10">
                {recentOrders.map((order) => (
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
                    <td className="px-5 py-3">
                      <span className="inline-flex rounded-full bg-sol-sun/30 px-3 py-1 text-xs font-bold text-sol-ink">
                        {order.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-black text-sol-ink">
                      {formatPriceDkk(order.totalDkk)}
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
