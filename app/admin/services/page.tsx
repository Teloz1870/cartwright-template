import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { Plus, Edit } from "lucide-react";
import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  EmptyState,
  AdminTable,
  AdminThead,
  AdminTh,
  AdminTbody,
  AdminTr,
  AdminTd,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminServicesPage() {
  await requireAdmin();

  const services = await prisma.service.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Services"
        primaryAction={
          <AdminButton href="/admin/services/new" variant="primary" icon={Plus}>
            Create service
          </AdminButton>
        }
      />

      <AdminCard padding="none">
        {services.length === 0 ? (
          <EmptyState title="No services yet." />
        ) : (
          <AdminTable>
            <AdminThead>
              <tr>
                <AdminTh>Ydelse</AdminTh>
                <AdminTh className="hidden sm:table-cell">Slug</AdminTh>
                <AdminTh className="hidden md:table-cell">Pris (Tekst)</AdminTh>
                <AdminTh align="right">Actions</AdminTh>
              </tr>
            </AdminThead>
            <AdminTbody>
              {services.map((service) => (
                <AdminTr key={service.id}>
                  <AdminTd className="font-semibold">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-sol-accent"></div>
                      {service.title}
                    </div>
                  </AdminTd>
                  <AdminTd className="text-sol-muted hidden sm:table-cell font-mono text-xs">
                    /{service.slug}
                  </AdminTd>
                  <AdminTd className="text-sol-muted hidden md:table-cell">
                    {service.priceString || "-"}
                  </AdminTd>
                  <AdminTd align="right">
                    <AdminButton
                      href={`/admin/services/${service.id}`}
                      variant="secondary"
                      size="sm"
                      icon={Edit}
                    >
                      Edit
                    </AdminButton>
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
