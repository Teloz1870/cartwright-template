import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Button } from "@/components/Button";
import { formatPriceDkk } from "@/lib/format";

const STATUS_LABELS: Record<string, string> = {
  paid: "Betalt",
  pending: "Afventer",
  shipped: "Afsendt",
  cancelled: "Annulleret",
};

const dateFormatter = new Intl.DateTimeFormat("da-DK", { dateStyle: "long" });

export default async function OrdrerPage() {
  const session = await auth();
  if (!session) {
    redirect("/konto/login");
  }

  const orders = await prisma.order.findMany({
    where: { userId: session.user.id },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="min-h-screen bg-sol-cream px-4 py-16">
      <div className="w-full max-w-2xl mx-auto">
        <h1 className="text-3xl font-black text-sol-ink mb-8">Mine ordrer</h1>

        {orders.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-sm border border-sol-ink/10 px-8 py-12 text-center flex flex-col items-center gap-6">
            <p className="text-sol-muted text-lg">Du har ingen ordrer endnu.</p>
            <Button href="/produkter" variant="primary">
              Gå til produkter
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {orders.map((order) => {
              const itemCount = order.items.reduce(
                (sum, item) => sum + item.quantity,
                0,
              );
              const statusLabel =
                STATUS_LABELS[order.status] ?? order.status;

              return (
                <div
                  key={order.id}
                  className="bg-white rounded-3xl shadow-sm border border-sol-ink/10 px-8 py-6 flex flex-col gap-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-sol-muted uppercase tracking-wide mb-1">
                        Ordrenummer
                      </p>
                      <p className="font-bold text-sol-ink break-all text-sm">
                        {order.id}
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-sol-sun/30 px-3 py-1 text-xs font-bold text-sol-ink">
                      {statusLabel}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-6 text-sm text-sol-muted">
                    <div>
                      <span className="font-semibold text-sol-ink">Dato: </span>
                      {dateFormatter.format(order.createdAt)}
                    </div>
                    <div>
                      <span className="font-semibold text-sol-ink">
                        Antal varer:{" "}
                      </span>
                      {itemCount}
                    </div>
                    <div>
                      <span className="font-semibold text-sol-ink">
                        Total:{" "}
                      </span>
                      {formatPriceDkk(order.totalDkk)}
                    </div>
                  </div>

                  <div>
                    <Button href={`/ordre/${order.id}`} variant="ghost">
                      Se detaljer
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8">
          <Link
            href="/konto"
            className="text-sm font-semibold text-sol-ink hover:text-sol-accent transition"
          >
            ← Tilbage til min konto
          </Link>
        </div>
      </div>
    </main>
  );
}
