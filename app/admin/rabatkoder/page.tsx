import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { formatPriceDkk } from "@/lib/format";
import {
  AdminPageHeader,
  AdminCard,
  EmptyState,
  AdminTable,
  AdminThead,
  AdminTh,
  AdminTbody,
  AdminTr,
  AdminTd,
} from "@/components/admin/ui";
import DiscountCodeForm, {
  ToggleDiscountButton,
} from "@/components/admin/DiscountCodeForm";

export default async function AdminDiscountCodesPage() {
  await requireAdmin();

  const discountCodes = await prisma.discountCode.findMany({
    orderBy: { id: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader title="Rabatkoder" />

      <AdminCard>
        <DiscountCodeForm />
      </AdminCard>

      <AdminCard padding="none">
        {discountCodes.length === 0 ? (
          <EmptyState title="Ingen rabatkoder endnu." />
        ) : (
          <AdminTable minWidth="760px">
            <AdminThead>
              <tr>
                <AdminTh>Kode</AdminTh>
                <AdminTh>Type</AdminTh>
                <AdminTh align="right">Value</AdminTh>
                <AdminTh align="right">Forbrug</AdminTh>
                <AdminTh align="center">Aktiv</AdminTh>
                <AdminTh align="right">Handling</AdminTh>
              </tr>
            </AdminThead>
            <AdminTbody>
              {discountCodes.map((code) => (
                <AdminTr key={code.id}>
                  <AdminTd className="font-black">
                    {code.code}
                  </AdminTd>
                  <AdminTd className="text-sol-muted">
                    {code.type === "percent" ? "Percentage" : "Fixed amount"}
                  </AdminTd>
                  <AdminTd align="right" className="font-black">
                    {code.type === "percent"
                      ? `${code.value}%`
                      : formatPriceDkk(code.value)}
                  </AdminTd>
                  <AdminTd align="right" className="font-semibold text-sol-muted">
                    {code.usageCount} / {code.usageLimit ?? "∞"}
                  </AdminTd>
                  <AdminTd align="center" className="font-black">
                    {code.active ? "✓" : "—"}
                  </AdminTd>
                  <AdminTd>
                    <div className="flex justify-end">
                      <ToggleDiscountButton id={code.id} active={code.active} />
                    </div>
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
