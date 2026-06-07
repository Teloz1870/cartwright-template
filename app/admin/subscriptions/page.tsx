import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { subscriptionsFeatureEnabled } from "@/lib/subscriptions";
import { cancelSubscriptionAction } from "./actions";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" });

function statusClass(status: string): string {
  switch (status) {
    case "active":
    case "trialing":
      return "bg-emerald-100 text-emerald-900";
    case "paused":
      return "bg-amber-100 text-amber-900";
    case "past_due":
    case "unpaid":
      return "bg-red-100 text-red-900";
    case "canceled":
    case "incomplete_expired":
      return "bg-sol-ink/10 text-sol-muted";
    default:
      return "bg-sol-sun/30 text-sol-ink";
  }
}

export default async function AdminSubscriptionsPage() {
  await requireAdmin();
  if (!subscriptionsFeatureEnabled()) notFound();

  const subscriptions = await prisma.subscription.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      user: { select: { name: true, email: true } },
    },
    take: 200,
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-black text-sol-ink">Abonnementer</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
          Stripe Billing abonnementer synkroniseret fra webhooks. Opsigelse
          sættes til periodens udløb, så kunden beholder betalt adgang.
        </p>
      </header>

      <section className="sol-card-elevated">
        {subscriptions.length === 0 ? (
          <p className="px-5 py-8 text-sm font-semibold text-sol-muted">
            Ingen abonnementer endnu.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-sol-cream/70 text-xs uppercase text-sol-muted">
                <tr>
                  <th className="px-5 py-3 font-black">Kunde</th>
                  <th className="px-5 py-3 font-black">Plan</th>
                  <th className="px-5 py-3 font-black">Status</th>
                  <th className="px-5 py-3 font-black">Næste fornyelse</th>
                  <th className="px-5 py-3 font-black">Stripe</th>
                  <th className="px-5 py-3 text-right font-black">Handling</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sol-ink/10">
                {subscriptions.map((subscription) => (
                  <tr key={subscription.id}>
                    <td className="px-5 py-3">
                      <div className="font-bold text-sol-ink">
                        {subscription.user.name || subscription.user.email || "Ukendt kunde"}
                      </div>
                      <div className="text-xs font-medium text-sol-muted">
                        {subscription.user.email}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-sol-muted">
                      {subscription.stripePriceId}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase ${statusClass(subscription.status)}`}
                        >
                          {subscription.status}
                        </span>
                        {subscription.cancelAtPeriodEnd && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-900">
                            Opsagt
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sol-muted">
                      {dateFormatter.format(subscription.currentPeriodEnd)}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-sol-muted">
                      {subscription.stripeSubId}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {subscription.status !== "canceled" &&
                      !subscription.cancelAtPeriodEnd ? (
                        <form action={cancelSubscriptionAction}>
                          <input type="hidden" name="id" value={subscription.id} />
                          <button
                            type="submit"
                            className="rounded-md border border-red-200 px-3 py-2 text-xs font-black text-red-700 transition hover:bg-red-50"
                          >
                            Opsig
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs font-semibold text-sol-muted">
                          Ingen handling
                        </span>
                      )}
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
