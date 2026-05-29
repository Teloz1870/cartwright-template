import { requireAdmin } from "@/lib/admin";
import CategoryForm from "@/components/admin/CategoryForm";

export default async function NewCategoryPage() {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-black text-sol-ink">Ny kategori</h1>
      <CategoryForm />
    </div>
  );
}
