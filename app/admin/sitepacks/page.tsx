import { notFound } from "next/navigation";
import { brand } from "@/brand.config";
import { getFeatures } from "@/lib/brand";
import { requireAdmin } from "@/lib/admin";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import { SitePackWizard } from "./SitePackWizard";

export const dynamic = "force-dynamic";

/**
 * /admin/sitepacks — the Snapshot & Restore wizard. Export the whole site to a
 * portable .cartpack, or restore one onto this site (non-destructive, with an
 * undo snapshot). Behind the default-off `sitePack` flag.
 */
export default async function SitePacksPage() {
  await requireAdmin();
  // Gate mirrors the nav entry's flag exactly (genome / registry-stats
  // precedent): the RUNTIME view — brand.config default merged with the
  // /admin/features override — so flipping the flag in the admin takes effect
  // without a redeploy, and flag-off ⇒ nav entry gone AND direct URL 404s
  // (adaptive-admin invariant). Compile-time `brand.features` ignored the
  // override, the same class as the cron gate fix.
  const features = await getFeatures();
  if (!features.sitePack) notFound();

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Snapshot & Restore"
        subtitle="Export this entire site as a portable .cartpack, or restore one onto this site."
        breadcrumb={[
          { label: "Admin", href: "/admin" },
          { label: "Snapshot & Restore", href: "/admin/sitepacks" },
        ]}
      />

      <SitePackWizard currentMode={brand.mode} />
    </div>
  );
}
