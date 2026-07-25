import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { brand } from "@/brand.config";
import { getResendStatus } from "@/app/admin/integrations/actions";
import { isAiConfigured } from "@/lib/ai/status";
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
  const aiConfigured = await isAiConfigured();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Setup-wizard"
        subtitle="6 quick steps to get your shop ready. You can always come back and change every field later."
      />

      <SetupWizard
        initialStoreName={settings?.storeName ?? brand.storeName}
        initialAnnouncement={settings?.announcement ?? ""}
        initialBrandSlug={brand.storeSlug}
        initialResendConfigured={resend.isSet}
        // Seed the business-model + industry pickers from this fork's
        // brand.config so a website-mode scaffold doesn't open with "E-commerce"
        // pre-selected. The user can still switch either.
        initialEcommerceEnabled={brand.ecommerceEnabled}
        initialIndustryTemplate={brand.industryTemplate}
        // Magic Init calls the AI — only surface it once a provider is set up.
        aiConfigured={aiConfigured}
      />
    </div>
  );
}
