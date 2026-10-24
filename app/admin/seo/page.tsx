import { getSeoForUi } from "./actions";
import { SeoForm } from "./SeoForm";
import { AdminPageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminSeoPage() {
  const settings = await getSeoForUi();
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="SEO & indexing"
        subtitle="Control whether the site may be indexed by search engines and AI crawlers. Changes take effect on /robots.txt within 30 seconds."
      />
      <SeoForm initial={settings} />
    </div>
  );
}
