import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { formatPriceDkk } from "@/lib/format";
import DiscountCodeForm, {
  ToggleDiscountButton,
} from "@/components/admin/DiscountCodeForm";

export default async function AdminDiscountCodesPage() {
  await requireAdmin();

  const discountCodes = await prisma.discountCode.findMany({
    orderBy: { id: "desc" },
  });

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-black text-sol-ink">Rabatkoder</h1>

      <section className="rounded-2xl border border-sol-ink/10 bg-white p-5 shadow-sm">
        <DiscountCodeForm />
      </section>

      <section className="sol-card-elevated">
        {discountCodes.length === 0 ? (
          <p className="px-5 py-8 text-sm font-semibold text-sol-muted">
            Ingen rabatkoder endnu.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-sol-cream/70 text-xs uppercase text-sol-muted">
                <tr>
                  <th className="px-5 py-3 font-black">Kode</th>
                  <th className="px-5 py-3 font-black">Type</th>
                  <th className="px-5 py-3 text-right font-black">Værdi</th>
                  <th className="px-5 py-3 text-right font-black">Forbrug</th>
                  <th className="px-5 py-3 text-center font-black">Aktiv</th>
                  <th className="px-5 py-3 text-right font-black">Handling</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sol-ink/10">
                {discountCodes.map((code) => (
                  <tr key={code.id}>
                    <td className="px-5 py-3 font-black text-sol-ink">
                      {code.code}
                    </td>
                    <td className="px-5 py-3 text-sol-muted">
                      {code.type === "percent" ? "Procent" : "Fast beløb"}
                    </td>
                    <td className="px-5 py-3 text-right font-black text-sol-ink">
                      {code.type === "percent"
                        ? `${code.value}%`
                        : formatPriceDkk(code.value)}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-sol-muted">
                      {code.usageCount} / {code.usageLimit ?? "∞"}
                    </td>
                    <td className="px-5 py-3 text-center font-black text-sol-ink">
                      {code.active ? "✓" : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end">
                        <ToggleDiscountButton id={code.id} active={code.active} />
                      </div>
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
