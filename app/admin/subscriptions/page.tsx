import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { subscriptionsFeatureEnabled } from "@/lib/subscriptions";
import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  AdminBadge,
  type BadgeTone,
  EmptyState,
  AdminTable,
  AdminThead,
  AdminTh,
  AdminTbody,
  AdminTr,
  AdminTd,
} from "@/components/admin/ui";
import { cancelSubscriptionAction } from "./actions";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" });

function statusTone(status: string): BadgeTone {
  switch (status) {
    case "active":
    case "trialing":
      return "success";
    case "paused":
      return "attention";
    case "past_due":
    case "unpaid":
      return "critical";
    case "canceled":
    case "incomplete_expired":
      return "neutral";
    default:
      return "attention";
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
      <AdminPageHeader
        title="Subscriptions"
        subtitle="Stripe Billing subscriptions synced from webhooks. Cancellation takes effect at the end of the period, so the customer keeps paid access."
      />

      <AdminCard padding="none">
        {subscriptions.length === 0 ? (
          <EmptyState title="No subscriptions yet." />
        ) : (
          <AdminTable minWidth="900px">
            <AdminThead>
              <tr>
                <AdminTh>Customer</AdminTh>
                <AdminTh>Plan</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Next renewal</AdminTh>
                <AdminTh>Stripe</AdminTh>
                <AdminTh align="right">Action</AdminTh>
              </tr>
            </AdminThead>
            <AdminTbody>
              {subscriptions.map((subscription) => (
                <AdminTr key={subscription.id}>
                  <AdminTd>
                    <div className="font-bold text-sol-ink">
                      {subscription.user.name || subscription.user.email || "Unknown customer"}
                    </div>
                    <div className="text-xs font-medium text-sol-muted">
                      {subscription.user.email}
                    </div>
                  </AdminTd>
                  <AdminTd className="font-mono text-xs text-sol-muted">
                    {subscription.stripePriceId}
                  </AdminTd>
                  <AdminTd>
                    <div className="flex flex-wrap items-center gap-2">
                      <AdminBadge tone={statusTone(subscription.status)}>
                        {subscription.status}
                      </AdminBadge>
                      {subscription.cancelAtPeriodEnd && (
                        <AdminBadge tone="attention">Canceled</AdminBadge>
                      )}
                    </div>
                  </AdminTd>
                  <AdminTd className="text-sol-muted">
                    {dateFormatter.format(subscription.currentPeriodEnd)}
                  </AdminTd>
                  <AdminTd className="font-mono text-xs text-sol-muted">
                    {subscription.stripeSubId}
                  </AdminTd>
                  <AdminTd align="right">
                    {subscription.status !== "canceled" &&
                    !subscription.cancelAtPeriodEnd ? (
                      <form action={cancelSubscriptionAction}>
                        <input type="hidden" name="id" value={subscription.id} />
                        <AdminButton type="submit" variant="destructive" size="sm">
                          Cancel
                        </AdminButton>
                      </form>
                    ) : (
                      <span className="text-xs font-semibold text-sol-muted">
                        No action
                      </span>
                    )}
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
