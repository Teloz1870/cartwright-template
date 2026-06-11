import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { brand } from "@/brand.config";
import { getResendStatus } from "@/app/admin/integrations/actions";
import { AdminPageHeader } from "@/components/admin/ui";
import SetupWizard from "./SetupWizard";

/**
 * Task D: setup-wizard route. Renderes ved /admin/setup. Layout-redirect
 * (i app/admin/layout.tsx) sender fresh forks hertil automatisk; admin kan
 * også besøge siden manuelt for at gå igennem flowet igen.
 */
export default async function SetupPage() {
  await requireAdmin();

  const settings = await prisma.brandingSettings.findUnique({
    where: { id: 1 },
  });
  const resend = await getResendStatus();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Setup-wizard"
        subtitle="5 quick steps to get your shop ready. You can always come back and change every field later."
      />

      <SetupWizard
        initialStoreName={settings?.storeName ?? brand.storeName}
        initialAnnouncement={settings?.announcement ?? ""}
        initialBrandSlug={brand.storeSlug}
        initialResendConfigured={resend.isSet}
      />
    </div>
  );
}
