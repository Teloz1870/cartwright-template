import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "short",
});

export default async function AdminCustomersPage() {
  await requireAdmin();

  const users = await prisma.user.findMany({
    where: { role: "customer" },
    include: { _count: { select: { orders: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-black text-sol-ink">Kunder</h1>

      <section className="sol-card-elevated">
        {users.length === 0 ? (
          <p className="px-5 py-8 text-sm font-semibold text-sol-muted">
            Ingen kunder endnu.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-sol-cream/70 text-xs uppercase text-sol-muted">
                <tr>
                  <th className="px-5 py-3 font-black">Navn</th>
                  <th className="px-5 py-3 font-black">Email</th>
                  <th className="px-5 py-3 text-right font-black">Antal ordrer</th>
                  <th className="px-5 py-3 text-right font-black">Oprettet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sol-ink/10">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-5 py-3 font-black text-sol-ink">
                      {user.name}
                    </td>
                    <td className="px-5 py-3 font-semibold text-sol-ink">
                      {user.email}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-sol-muted">
                      {user._count.orders}
                    </td>
                    <td className="px-5 py-3 text-right text-sol-muted">
                      {dateFormatter.format(user.createdAt)}
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
