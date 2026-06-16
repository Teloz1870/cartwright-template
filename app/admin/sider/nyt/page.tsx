import { requireAdmin } from "@/lib/admin";
import PageForm from "@/components/admin/PageForm";
import { AdminPageHeader } from "@/components/admin/ui";

export default async function NewPagePage() {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Ny side"
        breadcrumb={[{ label: "Sider", href: "/admin/sider" }]}
      />
      <PageForm />
    </div>
  );
}
