import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { formatPriceDkk } from "@/lib/format";
import { getBrand } from "@/lib/brand";
import { PUBLIC_AGENT_TOOL_NAMES } from "@/lib/tools/public";
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
    activeApiKeys,
    resolvedBrand,
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
    // AI-first metrics: how many tool calls from external AI/admin today
    prisma.auditLog.count({
      where: {
        createdAt: { gte: todayStart },
        actor: { startsWith: "apikey:" },
        ok: true,
      },
    }),
    // Unique storefront chat sessions today (groupBy on the actor string)
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
    prisma.apiKey.count({ where: { revokedAt: null } }),
    getBrand(),
  ]);

  const publicAgentSurface = Boolean(resolvedBrand.features.mcpPublic);
  let auditTarget = "your-domain.com";
  try {
    auditTarget = new URL(resolvedBrand.url).hostname;
  } catch {
    // Keep the neutral fallback when a fork has not configured a valid URL yet.
  }
  const publicScorecard = `https://is-agentic.com/scan/${auditTarget}/${resolvedBrand.defaultLocale}`;

  const stats = [
    { label: "Orders", value: orderCount.toString() },
    { label: "Revenue", value: formatPriceDkk(revenue._sum.totalDkk ?? 0) },
    { label: "Produkter", value: productCount.toString() },
    { label: "Low stock", value: lowStockCount.toString() },
    { label: "Customers", value: customerCount.toString() },
  ];

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader title="Dashboard" />

      {/* Evidence-first command center. Deliberately no numeric third-party
          score: a fork must earn and verify its own current public report. */}
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#080808] text-white shadow-sm">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-300">
                  Agentic command center
                </p>
                <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider ${publicAgentSurface ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-amber-400/25 bg-amber-400/10 text-amber-200"}`}>
                  {publicAgentSurface ? "Public read surface live" : "Public surface disabled"}
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight">Contracts you can inspect. Authority you can control.</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/65">
                {publicAgentSurface
                  ? `${PUBLIC_AGENT_TOOL_NAMES.length} public tools expose published content read-only. Customer data, orders, checkout state, administration and every write require a scoped key.`
                  : "The public read surface is disabled. Private reads and every write require a scoped key."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={publicScorecard}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-10 items-center rounded-xl border border-white/15 bg-white/5 px-4 text-xs font-bold text-white transition hover:bg-white/10"
              >
                Public scorecard ↗
              </a>
              <Link
                href="/admin/api-keys"
                className="inline-flex min-h-10 items-center rounded-xl bg-white px-4 text-xs font-black text-black transition hover:bg-neutral-200"
              >
                API keys ({activeApiKeys})
              </Link>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["MCP", "/api/mcp", "Streamable HTTP"],
              ["OpenAPI 3.1", "/openapi.json", "Registry-generated"],
              ["REST", "/api/v1/tools", "Per-operation security"],
              ["Guidance", "/llms.txt", "Markdown + Vary"],
            ].map(([label, href, detail]) => (
              <a key={href} href={href} target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 bg-white/[0.035] p-3.5 transition hover:border-white/25 hover:bg-white/[0.06]">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-white/45">{label}</span>
                <code className="mt-2 block truncate text-xs font-bold text-emerald-300">{href}</code>
                <span className="mt-1.5 block text-[11px] text-white/45">{detail}</span>
              </a>
            ))}
          </div>
        </div>

        <div className="grid gap-4 px-5 py-5 sm:grid-cols-4">
          <div>
            <p className="text-3xl font-black">
              {publicAgentSurface ? PUBLIC_AGENT_TOOL_NAMES.length : 0}
            </p>
            <p className="mt-1 text-xs uppercase tracking-wider text-white/55">Public read tools</p>
          </div>
          <div>
            <p className="text-3xl font-black">{activeApiKeys}</p>
            <p className="mt-1 text-xs uppercase tracking-wider text-white/55">Active scoped keys</p>
          </div>
          <div>
            <p className="text-3xl font-black">{aiActionsToday}</p>
            <p className="mt-1 text-xs uppercase tracking-wider text-white/55">Key-authorized calls today</p>
          </div>
          <div>
            <p className="text-3xl font-black">{chatSessionsToday}</p>
            <p className="mt-1 text-xs uppercase tracking-wider text-white/55">Customer chat sessions</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-sol-accent px-5 py-5 text-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-sol-sun">
              AI-first · i dag
            </p>
            <p className="mt-1 text-sm text-white/85">Verified activity recorded in the local audit trail</p>
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
          <EmptyState title="No orders yet." />
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
