import { requireAdmin } from "@/lib/admin";
import PageForm from "@/components/admin/PageForm";
import { AdminPageHeader } from "@/components/admin/ui";

export default async function NewPagePage() {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="New page"
        breadcrumb={[{ label: "Pages", href: "/admin/sider" }]}
      />
      <PageForm />
    </div>
  );
}
