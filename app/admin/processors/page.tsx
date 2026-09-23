import { brand } from "@/brand.config";
import { getLegalStatus } from "./actions";
import { LegalPagesPanel } from "./LegalPagesPanel";
import {
  AdminPageHeader,
  AdminCard,
  AdminBadge,
  AdminTable,
  AdminThead,
  AdminTh,
  AdminTbody,
  AdminTr,
  AdminTd,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminProcessorsPage() {
  const legal = await getLegalStatus();
  const processors = brand.policies.processors;

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Data processors & GDPR"
        subtitle="Processor registry (GDPR art. 28) + status of legal pages. The registry is edited in brand.config.ts (policies.processors)."
      />

      <AdminCard title={`Processor registry (${processors.length})`} padding="none">
        <AdminTable>
          <AdminThead>
            <AdminTr>
              <AdminTh>Processor</AdminTh>
              <AdminTh>Purpose</AdminTh>
              <AdminTh>Shared data</AdminTh>
              <AdminTh>DPA</AdminTh>
            </AdminTr>
          </AdminThead>
          <AdminTbody>
            {processors.map((p) => (
              <AdminTr key={p.name}>
                <AdminTd>{p.name}</AdminTd>
                <AdminTd>{p.purpose}</AdminTd>
                <AdminTd>{p.data}</AdminTd>
                <AdminTd>
                  <AdminBadge tone={p.dpa ? "success" : "attention"}>
                    {p.dpa ? "yes" : "missing"}
                  </AdminBadge>
                </AdminTd>
              </AdminTr>
            ))}
          </AdminTbody>
        </AdminTable>
      </AdminCard>

      <LegalPagesPanel initial={legal} />
    </div>
  );
}
