import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { formatPriceDkk } from "@/lib/format";
import OrderStatusForm from "@/components/admin/OrderStatusForm";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminOrderPage({ params }: Props) {
  await requireAdmin();

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!order) notFound();

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <Link
          href="/admin/ordrer"
          className="text-sm font-bold text-sol-muted transition hover:text-sol-accent"
        >
          ← Tilbage til ordrer
        </Link>
        <h1 className="mt-3 break-all text-3xl font-black text-sol-ink">
          Ordre #{order.id}
        </h1>
      </div>

      <section className="rounded-2xl border border-sol-ink/10 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-xl font-black text-sol-ink">Kunde</h2>
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-black uppercase text-sol-muted">Email</p>
            <p className="mt-1 font-semibold text-sol-ink">{order.email}</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase text-sol-muted">Leveringsadresse</p>
            <p className="mt-1 font-semibold leading-relaxed text-sol-ink">
              {order.shippingName}
              <br />
              {order.shippingAddress}
              <br />
              {order.shippingZip} {order.shippingCity}
            </p>
          </div>
        </div>
      </section>

      <section className="sol-card-elevated">
        <div className="border-b border-sol-ink/10 px-5 py-4">
          <h2 className="text-xl font-black text-sol-ink">Varer</h2>
        </div>

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
                {order.shippingDkk === 0 ? "Gratis" : formatPriceDkk(order.shippingDkk)}
              </span>
            </div>

            <div className="flex justify-between gap-4 border-t border-sol-ink/10 pt-2 text-lg font-black text-sol-ink">
              <span>Total</span>
              <span>{formatPriceDkk(order.totalDkk)}</span>
            </div>
          </div>
        </div>
      </section>

      <OrderStatusForm orderId={order.id} currentStatus={order.status} />
    </div>
  );
}
