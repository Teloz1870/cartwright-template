import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { getLocale } from "next-intl/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/brand";
import { displayFont } from "@/components/surfaces/DesignSurface";
import { subscriptionsFeatureEnabled } from "@/lib/subscriptions";
import {
  cancelCustomerSubscriptionAction,
  pauseCustomerSubscriptionAction,
  resumeCustomerSubscriptionAction,
} from "./actions";

export const dynamic = "force-dynamic";

/**
 * Built per request from the READING locale, not once at module scope from a
 * hardcoded one. The two pages of this account section disagreed with each
 * other: orders formatted every date `en-US` (so /da showed "August 28, 2026")
 * while subscriptions formatted every date `da-DK` (so /en showed
 * "28. august 2026"). Both wrong, in opposite directions, in the same section.
 */
function dateFormatterFor(locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long" });
}

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
  const locale = await getLocale();
  const dateFormatter = dateFormatterFor(locale);
  if (!subscriptionsFeatureEnabled()) notFound();

  const t = await getTranslations("Account");

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

  // Mixer 2.0 Phase 4 — designSurfaces: page surface + header adopt the active
  // palette; the cards stay dark (explicit text-white added) so their white-text
  // contents stay legible on every palette. Flag OFF (default) → exact legacy
  // classes (byte-identical).
  const designSurfaces =
    Boolean((await getBrand().catch(() => null))?.features.designSurfaces);
  const mainClass = designSurfaces
    ? "min-h-screen bg-sol-cream px-4 py-16 text-sol-ink"
    : "min-h-screen bg-black px-4 py-16 text-white";
  const headerSubClass = designSurfaces
    ? "mt-2 text-sm font-medium text-sol-muted"
    : "mt-2 text-sm font-medium text-white/55";
  const backLinkClass = designSurfaces
    ? "text-sm font-bold text-sol-accent hover:underline"
    : "text-sm font-bold text-white/70 hover:text-white";
  const emptyCardClass = designSurfaces
    ? "rounded-2xl border border-sol-ink/15 bg-[#0A0A0A] p-8 text-white shadow-xl"
    : "rounded-2xl border border-white/10 bg-[#0A0A0A] p-8 shadow-2xl shadow-[var(--cw-brand-on-dark)]/10";
  const subCardClass = designSurfaces
    ? "rounded-2xl border border-sol-ink/15 bg-[#0A0A0A] p-6 text-white shadow-xl"
    : "rounded-2xl border border-white/10 bg-[#0A0A0A] p-6 shadow-2xl shadow-[var(--cw-brand-on-dark)]/10";
  const inactiveCardClass = designSurfaces
    ? "rounded-2xl border border-sol-ink/15 bg-[#0A0A0A] p-6 text-white"
    : "rounded-2xl border border-white/10 bg-white/[0.03] p-6";

  return (
    <main className={mainClass} {...(designSurfaces ? { "data-design-surface": true } : {})}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1
              className="text-4xl font-black tracking-tighter"
              {...(designSurfaces ? { style: displayFont } : {})}
            >
              {t("subs_title")}
            </h1>
            <p className={headerSubClass}>
              {t("subs_subtitle")}
            </p>
          </div>
          <Link href="/account" className={backLinkClass}>
            {t("subs_backToAccount")}
          </Link>
        </header>

        {subscriptions.length === 0 ? (
          <section className={emptyCardClass}>
            <h2 className="text-xl font-black">{t("subs_emptyTitle")}</h2>
            <p className="mt-2 text-sm text-white/55">
              {t("subs_emptyBody")}
            </p>
            <form action="/api/checkout/subscription" method="post" className="mt-6">
              <button
                type="submit"
                className="h-12 rounded-md bg-white px-5 text-sm font-black text-black transition hover:bg-white/90"
              >
                {t("subs_startSubscription")}
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
                  className={subCardClass}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-white/40">
                        {t("subs_planLabel")}
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
                          {t("subs_canceledBadge")}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 text-sm text-white/60 sm:grid-cols-2">
                    <div>
                      <span className="font-bold text-white">{t("subs_nextRenewal")} </span>
                      {dateFormatter.format(subscription.currentPeriodEnd)}
                    </div>
                    <div>
                      <span className="font-bold text-white">{t("subs_stripeId")} </span>
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
                          {isPaused ? t("subs_resume") : t("subs_pause")}
                        </button>
                      </form>
                      <form action={cancelCustomerSubscriptionAction}>
                        <input type="hidden" name="id" value={subscription.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-red-400/40 px-4 py-2 text-sm font-bold text-red-200 transition hover:bg-red-500/10"
                        >
                          {t("subs_cancel")}
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
          <section className={inactiveCardClass}>
            <p className="text-sm text-white/55">
              {t("subs_inactiveBody")}
            </p>
            <form action="/api/checkout/subscription" method="post" className="mt-4">
              <button
                type="submit"
                className="h-11 rounded-md bg-white px-5 text-sm font-black text-black transition hover:bg-white/90"
              >
                {t("subs_startNewSubscription")}
              </button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
