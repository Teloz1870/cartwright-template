import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { formatPriceDkk } from "@/lib/format";
import {
  AdminPageHeader,
  AdminCard,
  AdminBadge,
  orderStatusTone,
  EmptyState,
  AdminTable,
  AdminThead,
  AdminTh,
  AdminTbody,
  AdminTr,
  AdminTd,
} from "@/components/admin/ui";

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
    { label: "Revenue", value: formatPriceDkk(revenue._sum.totalDkk ?? 0) },
    { label: "Produkter", value: productCount.toString() },
    { label: "Lavt lager", value: lowStockCount.toString() },
    { label: "Kunder", value: customerCount.toString() },
  ];

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader title="Dashboard" />

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
          <AdminCard key={stat.label}>
            <p className="text-3xl font-black text-sol-ink">{stat.value}</p>
            <p className="mt-1 text-sm font-semibold text-sol-muted">
              {stat.label}
            </p>
          </AdminCard>
        ))}
      </section>

      <AdminCard title="Seneste ordrer" padding="none">
        {recentOrders.length === 0 ? (
          <EmptyState title="Ingen ordrer endnu." />
        ) : (
          <AdminTable minWidth="640px">
            <AdminThead>
              <AdminTr>
                <AdminTh>Ordre</AdminTh>
                <AdminTh>Dato</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh align="right">Total</AdminTh>
              </AdminTr>
            </AdminThead>
            <AdminTbody>
              {recentOrders.map((order) => (
                <AdminTr key={order.id}>
                  <AdminTd>
                    <Link
                      href={`/admin/ordrer/${order.id}`}
                      className="font-bold text-sol-ink underline decoration-sol-accent/40 underline-offset-4 transition hover:text-sol-accent"
                    >
                      {order.id}
                    </Link>
                  </AdminTd>
                  <AdminTd className="text-sol-muted">
                    {dateFormatter.format(order.createdAt)}
                  </AdminTd>
                  <AdminTd>
                    <AdminBadge tone={orderStatusTone(order.status)}>
                      {order.status}
                    </AdminBadge>
                  </AdminTd>
                  <AdminTd align="right" className="font-black">
                    {formatPriceDkk(order.totalDkk)}
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
