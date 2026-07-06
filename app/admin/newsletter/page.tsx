import { requireAdmin } from "@/lib/admin";
import { listSubscribers, subscriberStats } from "@/lib/newsletter";
import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  AdminBadge,
  EmptyState,
  AdminTable,
  AdminThead,
  AdminTh,
  AdminTbody,
  AdminTr,
  AdminTd,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminNewsletterPage() {
  await requireAdmin();
  const [subs, stats] = await Promise.all([listSubscribers(), subscriberStats()]);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Nyhedsbrev"
        subtitle={`${stats.confirmed} tilmeldte · ${stats.unsubscribed} afmeldte · ${stats.total} i alt.`}
        primaryAction={
          <AdminButton href="/admin/newsletter/export" variant="primary">
            Eksportér CSV
          </AdminButton>
        }
      />

      <AdminCard padding="none">
        {subs.length === 0 ? (
          <EmptyState title="Ingen tilmeldinger endnu." />
        ) : (
          <AdminTable>
            <AdminThead>
              <AdminTr>
                <AdminTh>Email</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Kilde</AdminTh>
                <AdminTh>Tilmeldt</AdminTh>
              </AdminTr>
            </AdminThead>
            <AdminTbody>
              {subs.map((s) => (
                <AdminTr key={s.id}>
                  <AdminTd>{s.email}</AdminTd>
                  <AdminTd>
                    <AdminBadge
                      tone={
                        s.status === "confirmed"
                          ? "success"
                          : s.status === "unsubscribed"
                            ? "critical"
                            : "neutral"
                      }
                    >
                      {s.status}
                    </AdminBadge>
                  </AdminTd>
                  <AdminTd className="text-sol-muted">{s.source ?? "—"}</AdminTd>
                  <AdminTd className="text-sol-muted">
                    {new Date(s.createdAt).toLocaleDateString("da-DK")}
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
