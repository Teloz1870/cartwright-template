import { requireAdmin } from "@/lib/admin";
import { listSubscribers, subscriberStats } from "@/lib/newsletter";

export const dynamic = "force-dynamic";

export default async function AdminNewsletterPage() {
  await requireAdmin();
  const [subs, stats] = await Promise.all([listSubscribers(), subscriberStats()]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-sol-ink">Nyhedsbrev</h1>
          <p className="mt-1 text-sm text-sol-muted">
            {stats.confirmed} tilmeldte · {stats.unsubscribed} afmeldte · {stats.total} i alt.
          </p>
        </div>
        <a
          href="/admin/newsletter/export"
          className="shrink-0 rounded-lg bg-sol-accent px-4 py-2 text-sm font-bold text-white transition hover:bg-sol-accent-deep"
        >
          Eksportér CSV
        </a>
      </header>

      {subs.length === 0 ? (
        <p className="text-sol-muted">Ingen tilmeldinger endnu.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border-2 border-sol-ink/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-sol-sand text-xs uppercase tracking-wide text-sol-muted">
              <tr>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Kilde</th>
                <th className="px-3 py-2">Tilmeldt</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} className="border-t border-sol-ink/10">
                  <td className="px-3 py-2 text-sol-ink">{s.email}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                        s.status === "confirmed"
                          ? "bg-emerald-100 text-emerald-700"
                          : s.status === "unsubscribed"
                            ? "bg-red-100 text-red-700"
                            : "bg-sol-ink/10 text-sol-muted"
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sol-muted">{s.source ?? "—"}</td>
                  <td className="px-3 py-2 text-sol-muted">
                    {new Date(s.createdAt).toLocaleDateString("da-DK")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
