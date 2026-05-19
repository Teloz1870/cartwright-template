import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { brand } from "@/brand.config";
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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black text-sol-ink">Setup-wizard</h1>
        <p className="mt-2 text-sm text-sol-muted">
          5 hurtige trin til at få din shop klar. Du kan altid komme tilbage og
          ændre alle felter senere.
        </p>
      </header>

      <SetupWizard
        initialStoreName={settings?.storeName ?? brand.storeName}
        initialAnnouncement={settings?.announcement ?? ""}
        initialBrandSlug={brand.storeSlug}
      />
    </div>
  );
}
