import { requireAdmin } from "@/lib/admin";
import PageForm from "@/components/admin/PageForm";

export default async function NewPagePage() {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-black text-sol-ink">Ny side</h1>
      <PageForm />
    </div>
  );
}
