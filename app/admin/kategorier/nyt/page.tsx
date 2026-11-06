import { requireAdmin } from "@/lib/admin";
import CategoryForm from "@/components/admin/CategoryForm";
import { AdminPageHeader } from "@/components/admin/ui";

export default async function NewCategoryPage() {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="New category"
        breadcrumb={[{ label: "Categories", href: "/admin/kategorier" }]}
      />
      <CategoryForm />
    </div>
  );
}
