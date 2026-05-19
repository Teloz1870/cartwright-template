import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { Button } from "@/components/Button";
import { formatPriceDkk } from "@/lib/format";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Ordrebekræftelse" };
}

export default async function OrderConfirmationPage({ params }: Props) {
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!order) notFound();

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      {/* Heading */}
      <div className="text-center mb-10">
        <h1 className="font-black text-5xl text-sol-ink leading-tight mb-3">
          Tak for din ordre!
        </h1>
        <p className="text-sol-muted text-base">
          Ordrenummer:{" "}
          <span className="font-bold text-sol-ink break-all">{order.id}</span>
        </p>
      </div>

      {/* Confirmation card */}
      <div className="bg-sol-cream rounded-2xl p-8 space-y-8">
        {/* Delivery address */}
        <section>
          <h2 className="font-black text-lg text-sol-ink mb-2 uppercase tracking-wide">
            Leveringsadresse
          </h2>
          <p className="text-sol-ink leading-relaxed">
            {order.shippingName}
            <br />
            {order.shippingAddress}
            <br />
            {order.shippingZip} {order.shippingCity}
          </p>
        </section>

        {/* Order items */}
        <section>
          <h2 className="font-black text-lg text-sol-ink mb-3 uppercase tracking-wide">
            Produkter
          </h2>
          <ul className="space-y-2">
            {order.items.map((item) => (
              <li
                key={item.id}
                className="flex items-baseline justify-between gap-4 text-sol-ink"
              >
                <span className="flex-1 font-medium">
                  {item.productName}{" "}
                  <span className="text-sol-muted font-normal">
                    × {item.quantity}
                  </span>
                </span>
                <span className="text-right text-sm text-sol-muted">
                  {formatPriceDkk(item.unitPriceDkk)} pr. stk
                </span>
                <span className="font-bold text-right min-w-[80px]">
                  {formatPriceDkk(item.unitPriceDkk * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Amounts */}
        <section className="border-t border-sol-sun pt-6 space-y-2">
          <div className="flex justify-between text-sol-ink">
            <span>Subtotal</span>
            <span>{formatPriceDkk(order.subtotalDkk)}</span>
          </div>

          {order.discountDkk > 0 && (
            <div className="flex justify-between text-sol-accent font-medium">
              <span>Rabat</span>
              <span>− {formatPriceDkk(order.discountDkk)}</span>
            </div>
          )}

          <div className="flex justify-between text-sol-ink">
            <span>Fragt</span>
            <span>
              {order.shippingDkk === 0
                ? "Gratis"
                : formatPriceDkk(order.shippingDkk)}
            </span>
          </div>

          <div className="flex justify-between text-sol-ink font-black text-xl pt-2 border-t border-sol-sun">
            <span>Total</span>
            <span>{formatPriceDkk(order.totalDkk)}</span>
          </div>
        </section>

        {/* Email note */}
        <p className="text-sol-muted text-sm text-center">
          En bekræftelse er sendt til{" "}
          <span className="font-semibold text-sol-ink">{order.email}</span>
        </p>
      </div>

      {/* CTA */}
      <div className="mt-10 flex justify-center">
        <Button href="/produkter">Fortsæt med at handle</Button>
      </div>
    </div>
  );
}
