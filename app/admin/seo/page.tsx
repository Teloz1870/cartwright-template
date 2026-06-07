import { getSeoForUi } from "./actions";
import { SeoForm } from "./SeoForm";
import { AdminPageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminSeoPage() {
  const settings = await getSeoForUi();
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="SEO & indeksering"
        subtitle="Styr om sitet må indekseres af søgemaskiner og AI-crawlere. Ændringer slår igennem på /robots.txt inden for 30 sekunder."
      />
      <SeoForm initial={settings} />
    </div>
  );
}
