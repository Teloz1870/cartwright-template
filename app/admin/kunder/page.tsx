import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
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
    <div className="flex flex-col gap-6">
      <AdminPageHeader title="Customers" />

      <AdminCard padding="none">
        {users.length === 0 ? (
          <EmptyState title="No customers yet." />
        ) : (
          <AdminTable minWidth="640px">
            <AdminThead>
              <tr>
                <AdminTh>Name</AdminTh>
                <AdminTh>Email</AdminTh>
                <AdminTh align="right">Orders</AdminTh>
                <AdminTh align="right">Created</AdminTh>
              </tr>
            </AdminThead>
            <AdminTbody>
              {users.map((user) => (
                <AdminTr key={user.id}>
                  <AdminTd className="font-black">
                    {user.name}
                  </AdminTd>
                  <AdminTd className="font-semibold">
                    {user.email}
                  </AdminTd>
                  <AdminTd align="right" className="font-semibold text-sol-muted">
                    {user._count.orders}
                  </AdminTd>
                  <AdminTd align="right" className="text-sol-muted">
                    {dateFormatter.format(user.createdAt)}
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
