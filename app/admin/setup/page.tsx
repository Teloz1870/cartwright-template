import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { brand } from "@/brand.config";
import { identityLockNotice } from "@/lib/identity";
import { getResendStatus } from "@/app/admin/integrations/actions";
import { isAiConfigured } from "@/lib/ai/status";
import { AdminPageHeader } from "@/components/admin/ui";
import SetupWizard from "./SetupWizard";
import { auditTrustContent } from "@/lib/trust-content-audit";

/**
 * Task D: setup-wizard route. Renderes ved /admin/setup. Layout-redirect
 * (in app/admin/layout.tsx) sends fresh forks here automatically; an admin can
 * also visit the page manually to walk through the flow again.
 */
export default async function SetupPage() {
  await requireAdmin();

  const settings = await prisma.brandingSettings.findUnique({
    where: { id: 1 },
  });
  const resend = await getResendStatus();
  const [aiConfigured, trustFindings] = await Promise.all([
    isAiConfigured(),
    auditTrustContent(),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Setup-wizard"
        subtitle="6 quick steps to get your shop ready. You can always come back and change every field later."
      />

      {trustFindings.length > 0 ? (
        <aside className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950" aria-labelledby="trust-audit-title">
          <h2 id="trust-audit-title" className="font-bold">Public trust content needs attention</h2>
          <p className="mt-1 text-sm">These warnings do not block setup, but should be resolved before a public launch.</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            {trustFindings.map((finding, index) => <li key={`${finding.page}-${index}`}>{finding.message}</li>)}
          </ul>
        </aside>
      ) : null}

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
        identityLockNotice={identityLockNotice()}
      />
    </div>
  );
}
