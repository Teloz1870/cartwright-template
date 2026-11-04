import Link from "next/link";
import { brand } from "@/brand.config";
import { requireAdmin } from "@/lib/admin";
import { getFeatures } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { formatPriceDkk } from "@/lib/format";
import { ORDER_TABS, ORDER_TABS_WITH_QUOTES, QUOTES_TAB, QUOTE_STATUS } from "@/lib/orders/status";
import { getOrderStatuses } from "@/lib/orders/status-reader";
import { orderStatusDisplay } from "@/lib/orders/status-table";
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
  const statuses = await getOrderStatuses();

  // Flag off → the old plain table (flipping the flag is reversible).
  if (!features.orderWorkspace) {
    const display = orderStatusDisplay(statuses);
    const quotesOnly = brand.features.quotes && sp.tab === QUOTES_TAB.key;
    const orders = await prisma.order.findMany({
      ...(quotesOnly ? { where: { status: QUOTE_STATUS } } : {}),
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return (
      <div className="flex flex-col gap-6">
        <AdminPageHeader title="Orders" />
        {brand.features.quotes && (
          <nav className="flex flex-wrap gap-2">
            {[ORDER_TABS[0], QUOTES_TAB].map((t) => (
              <Link
                key={t.key}
                href={t.key === QUOTES_TAB.key ? `/admin/ordrer?tab=${t.key}` : "/admin/ordrer"}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  (t.key === QUOTES_TAB.key) === quotesOnly
                    ? "bg-sol-accent text-white"
                    : "bg-sol-cream/70 text-sol-muted hover:text-sol-ink"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        )}
        <AdminCard padding="none">
          {orders.length === 0 ? (
            <EmptyState title="No orders yet." />
          ) : (
            <AdminTable minWidth="860px">
              <AdminThead>
                <tr>
                  <AdminTh>Order no.</AdminTh>
                  <AdminTh>Date</AdminTh>
                  <AdminTh>Email</AdminTh>
                  <AdminTh>Status</AdminTh>
                  <AdminTh align="right">Items</AdminTh>
                  <AdminTh align="right">Total</AdminTh>
                </tr>
              </AdminThead>
              <AdminTbody>
                {orders.map((order) => {
                  const itemCount = order.items.reduce(
                    (sum, item) => sum + item.quantity,
                    0,
                  );
                  return (
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
                      <AdminTd className="font-semibold">
                        {order.email}
                      </AdminTd>
                      <AdminTd>
                        <AdminBadge
                          tone={orderStatusTone(order.status)}
                          className={display.ownColor(order.status)}
                        >
                          {display.label(order.status)}
                        </AdminBadge>
                      </AdminTd>
                      <AdminTd align="right" className="font-semibold text-sol-muted">
                        {itemCount}
                      </AdminTd>
                      <AdminTd align="right" className="font-black">
                        {formatPriceDkk(order.totalDkk)}
                      </AdminTd>
                    </AdminTr>
                  );
                })}
              </AdminTbody>
            </AdminTable>
          )}
        </AdminCard>
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
      <AdminPageHeader title="Orders" />
      <OrdersWorkspace
        key={`${tab}|${sp.q ?? ""}|${sp.from ?? ""}|${sp.to ?? ""}`}
        initialRows={initial.rows}
        initialNextCursor={initial.nextCursor}
        statuses={statuses}
        // Only with the flag on, so with it off the page's payload is what it was.
        {...(brand.features.quotes ? { tabs: ORDER_TABS_WITH_QUOTES } : {})}
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
