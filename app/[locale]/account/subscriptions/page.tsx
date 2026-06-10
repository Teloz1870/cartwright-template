import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { subscriptionsFeatureEnabled } from "@/lib/subscriptions";
import {
  cancelCustomerSubscriptionAction,
  pauseCustomerSubscriptionAction,
  resumeCustomerSubscriptionAction,
} from "./actions";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("da-DK", { dateStyle: "long" });

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
    default:
      return "bg-white/10 text-white/70";
  }
}

export default async function AccountSubscriptionsPage() {
  if (!subscriptionsFeatureEnabled()) notFound();

  const session = await auth();
  if (!session?.user?.id) redirect("/account/login");

  const subscriptions = await prisma.subscription.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
  });

  const hasLiveSubscription = subscriptions.some(
    (subscription) =>
      !["canceled", "incomplete_expired"].includes(subscription.status),
  );

  return (
    <main className="min-h-screen bg-black px-4 py-16 text-white">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tighter">
              Mine abonnementer
            </h1>
            <p className="mt-2 text-sm font-medium text-white/55">
              Se fornyelse, status og administrér pause eller opsigelse.
            </p>
          </div>
          <Link href="/account" className="text-sm font-bold text-white/70 hover:text-white">
            Tilbage til konto
          </Link>
        </header>

        {subscriptions.length === 0 ? (
          <section className="rounded-2xl border border-white/10 bg-[#0A0A0A] p-8 shadow-2xl shadow-indigo-500/10">
            <h2 className="text-xl font-black">Ingen aktive abonnementer</h2>
            <p className="mt-2 text-sm text-white/55">
              Start et abonnement via Stripe Checkout. Planen styres af shoppens
              Stripe Price ID-konfiguration.
            </p>
            <form action="/api/checkout/subscription" method="post" className="mt-6">
              <button
                type="submit"
                className="h-12 rounded-md bg-white px-5 text-sm font-black text-black transition hover:bg-white/90"
              >
                Start abonnement
              </button>
            </form>
          </section>
        ) : (
          <div className="flex flex-col gap-4">
            {subscriptions.map((subscription) => {
              const isPaused = subscription.status === "paused";
              const isCanceled = subscription.status === "canceled";
              const canManage = !isCanceled && !subscription.cancelAtPeriodEnd;

              return (
                <section
                  key={subscription.id}
                  className="rounded-2xl border border-white/10 bg-[#0A0A0A] p-6 shadow-2xl shadow-indigo-500/10"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-white/40">
                        Plan
                      </p>
                      <p className="mt-1 font-mono text-sm text-white/80">
                        {subscription.stripePriceId}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black uppercase ${statusClass(subscription.status)}`}
                      >
                        {subscription.status}
                      </span>
                      {subscription.cancelAtPeriodEnd && (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase text-amber-900">
                          Opsagt
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 text-sm text-white/60 sm:grid-cols-2">
                    <div>
                      <span className="font-bold text-white">Næste fornyelse: </span>
                      {dateFormatter.format(subscription.currentPeriodEnd)}
                    </div>
                    <div>
                      <span className="font-bold text-white">Stripe ID: </span>
                      <span className="font-mono text-xs">{subscription.stripeSubId}</span>
                    </div>
                  </div>

                  {canManage && (
                    <div className="mt-6 flex flex-wrap gap-3">
                      <form
                        action={
                          isPaused
                            ? resumeCustomerSubscriptionAction
                            : pauseCustomerSubscriptionAction
                        }
                      >
                        <input type="hidden" name="id" value={subscription.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-white/15 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/5"
                        >
                          {isPaused ? "Genoptag" : "Pause"}
                        </button>
                      </form>
                      <form action={cancelCustomerSubscriptionAction}>
                        <input type="hidden" name="id" value={subscription.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-red-400/40 px-4 py-2 text-sm font-bold text-red-200 transition hover:bg-red-500/10"
                        >
                          Opsig
                        </button>
                      </form>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {!hasLiveSubscription && subscriptions.length > 0 && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <p className="text-sm text-white/55">
              Du har ingen aktiv eller planlagt abonnementsperiode lige nu.
            </p>
            <form action="/api/checkout/subscription" method="post" className="mt-4">
              <button
                type="submit"
                className="h-11 rounded-md bg-white px-5 text-sm font-black text-black transition hover:bg-white/90"
              >
                Start nyt abonnement
              </button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
