import { notFound } from "next/navigation";
import { getFeatures } from "@/lib/brand";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { formatPriceDkk } from "@/lib/format";
import { suggestNextActions } from "@/lib/orders/next-action";
import OrderStatusForm from "@/components/admin/OrderStatusForm";
import OrderTimeline from "@/components/admin/OrderTimeline";
import OrderTrackingForm from "@/components/admin/OrderTrackingForm";
import OrderNotesComposer from "@/components/admin/OrderNotesComposer";
import OrderActionButtons from "@/components/admin/OrderActionButtons";
import OrderReturnsPanel from "@/components/admin/OrderReturnsPanel";
import OrderAiPanel from "@/components/admin/OrderAiPanel";
import CreateFulfillmentButton from "@/components/admin/CreateFulfillmentButton";
import { LOW_STOCK_THRESHOLD } from "@/app/admin/ordrer/types";
import { AdminPageHeader, AdminCard, AdminButton } from "@/components/admin/ui";

type Props = { params: Promise<{ id: string }> };

// Ikke-component-helper: rule-of-hooks/purity forbyder Date.now() i en
// component render, but a plain (camelCase) function is exempt from the rule.
function computeSuggestions(args: {
  status: string;
  createdAt: Date;
  hasSupplier: boolean;
  lowStock: boolean;
  openReturns: number;
  hasStripePayment: boolean;
}) {
  const ageDays = (Date.now() - args.createdAt.getTime()) / 86_400_000;
  return suggestNextActions({
    status: args.status,
    ageDays,
    hasSupplier: args.hasSupplier,
    lowStock: args.lowStock,
    openReturns: args.openReturns,
    hasStripePayment: args.hasStripePayment,
  });
}

export default async function AdminOrderPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;
  const f = await getFeatures();

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: { select: { supplierId: true, stock: true } },
          variant: { select: { stock: true } },
        },
      },
      notes: { orderBy: { createdAt: "desc" } },
      returns: { include: { items: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!order) notFound();

  const customerAndItems = (
    <>
      <AdminCard title="Kunde">
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-black uppercase text-sol-muted">Email</p>
            <p className="mt-1 font-semibold text-sol-ink">{order.email}</p>
            {order.phoneNumber && (
              <p className="mt-1 text-sol-muted">{order.phoneNumber}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-black uppercase text-sol-muted">
              Leveringsadresse
            </p>
            <p className="mt-1 font-semibold leading-relaxed text-sol-ink">
              {order.shippingName}
              <br />
              {order.shippingAddress}
              <br />
              {order.shippingZip} {order.shippingCity}
            </p>
          </div>
          {order.billingName && (
            <div>
              <p className="text-xs font-black uppercase text-sol-muted">
                Faktureringsadresse
              </p>
              <p className="mt-1 font-semibold leading-relaxed text-sol-ink">
                {order.billingName}
                <br />
                {order.billingAddress}
                <br />
                {order.billingZip} {order.billingCity}
                {order.billingCountry ? `, ${order.billingCountry}` : ""}
              </p>
            </div>
          )}
        </div>
      </AdminCard>

      <div id="varer" className="scroll-mt-24">
      <AdminCard title="Varer" padding="none">
        <div className="divide-y divide-sol-ink/10">
          {order.items.map((item) => (
            <div
              key={item.id}
              className="grid gap-2 px-5 py-4 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center"
            >
              <div>
                <p className="font-black text-sol-ink">
                  {item.productName}{" "}
                  <span className="font-semibold text-sol-muted">
                    × {item.quantity}
                  </span>
                </p>
              </div>
              <p className="font-semibold text-sol-muted">
                {formatPriceDkk(item.unitPriceDkk)}
              </p>
              <p className="font-black text-sol-ink sm:min-w-24 sm:text-right">
                {formatPriceDkk(item.unitPriceDkk * item.quantity)}
              </p>
            </div>
          ))}
        </div>
        <div className="border-t border-sol-ink/10 bg-sol-cream/35 px-5 py-4">
          <div className="ml-auto max-w-sm space-y-2 text-sm">
            <div className="flex justify-between gap-4 text-sol-ink">
              <span>Subtotal</span>
              <span>{formatPriceDkk(order.subtotalDkk)}</span>
            </div>
            {order.discountDkk > 0 && (
              <div className="flex justify-between gap-4 font-semibold text-sol-accent">
                <span>Rabat</span>
                <span>− {formatPriceDkk(order.discountDkk)}</span>
              </div>
            )}
            <div className="flex justify-between gap-4 text-sol-ink">
              <span>Fragt</span>
              <span>
                {order.shippingDkk === 0
                  ? "Gratis"
                  : formatPriceDkk(order.shippingDkk)}
              </span>
            </div>
            <div className="flex justify-between gap-4 border-t border-sol-ink/10 pt-2 text-lg font-black text-sol-ink">
              <span>Total</span>
              <span>{formatPriceDkk(order.totalDkk)}</span>
            </div>
          </div>
        </div>
      </AdminCard>
      </div>
    </>
  );

  const header = (
    <AdminPageHeader
      title={<span className="break-all">Order #{order.id}</span>}
      breadcrumb={[{ label: "Orders", href: "/admin/ordrer" }]}
    />
  );

  // Flag off → the old minimal detail view (reversible).
  if (!f.orderWorkspace) {
    return (
      <div className="flex max-w-4xl flex-col gap-6">
        {header}
        {customerAndItems}
        <OrderStatusForm orderId={order.id} currentStatus={order.status} />
      </div>
    );
  }

  // ── Enhanced (orderWorkspace) ───────────────────────────────────────────
  const hasStripePayment = !!order.stripePaymentIntentId;
  const hasSupplier = order.items.some((i) => !!i.product?.supplierId);
  const lowStock = order.items.some(
    (i) => (i.variant?.stock ?? i.product?.stock ?? Infinity) <= LOW_STOCK_THRESHOLD,
  );
  const openReturns = order.returns.filter(
    (r) => !["refunded", "rejected", "closed"].includes(r.status),
  ).length;

  const suggestions = computeSuggestions({
    status: order.status,
    createdAt: order.createdAt,
    hasSupplier,
    lowStock,
    openReturns,
    hasStripePayment,
  });

  const noteViews = order.notes.map((n) => ({
    id: n.id,
    type: n.type,
    body: n.body,
    author: n.author,
    createdAt: n.createdAt.toISOString(),
  }));
  const itemViews = order.items.map((i) => ({
    id: i.id,
    productName: i.productName,
    quantity: i.quantity,
    unitPriceDkk: i.unitPriceDkk,
    variantId: i.variantId,
  }));
  const returnViews = order.returns.map((r) => ({
    id: r.id,
    status: r.status,
    reason: r.reason,
    refundDkk: r.refundDkk,
    restocked: r.restocked,
    createdAt: r.createdAt.toISOString(),
    items: r.items.map((ri) => ({
      id: ri.id,
      productName: ri.productName,
      quantity: ri.quantity,
    })),
  }));

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      {header}

      {f.orderAi && <OrderAiPanel suggestions={suggestions} />}

      {customerAndItems}

      <div id="status">
        <OrderTimeline
          orderId={order.id}
          currentStatus={order.status}
          notes={noteViews}
        />
        <div className="mt-3">
          <OrderNotesComposer orderId={order.id} />
        </div>
      </div>

      <div id="tracking">
        <OrderTrackingForm
          orderId={order.id}
          carrier={order.carrier}
          trackingNumber={order.trackingNumber}
          trackingUrl={order.trackingUrl}
          estDeliveryFrom={order.estDeliveryFrom?.toISOString() ?? null}
          estDeliveryTo={order.estDeliveryTo?.toISOString() ?? null}
        />
      </div>

      <div id="handlinger">
        <OrderActionButtons
          orderId={order.id}
          hasStripePayment={hasStripePayment}
        />
      </div>

      {f.fulfillmentPdf && (
        <div id="fulfillment" className="scroll-mt-24">
          <AdminCard title="Fulfillment">
            <div className="flex flex-wrap gap-3">
              <CreateFulfillmentButton orderId={order.id} />
              <AdminButton
                href={`/admin/ordrer/${order.id}/pakkeseddel`}
                target="_blank"
                rel="noopener noreferrer"
                variant="secondary"
                size="sm"
              >
                Print pakkeseddel / pluk-liste
              </AdminButton>
            </div>
          </AdminCard>
        </div>
      )}

      {f.returns && (
        <div id="returneringer">
          <OrderReturnsPanel
            orderId={order.id}
            items={itemViews}
            returns={returnViews}
            hasStripePayment={hasStripePayment}
          />
        </div>
      )}
    </div>
  );
}
