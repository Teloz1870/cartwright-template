import { brand } from "@/brand.config";
import { requireAdmin } from "@/lib/admin";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import AdminCard from "@/components/admin/ui/AdminCard";
import AdminButton from "@/components/admin/ui/AdminButton";
import { SitePackWizard } from "./SitePackWizard";

/**
 * /admin/sitepacks — the Snapshot & Restore wizard. Export the whole site to a
 * portable .cartpack, or restore one onto this site (non-destructive, with an
 * undo snapshot). Behind the default-off `sitePack` flag (the nav entry hides
 * when off; the tools re-check the flag server-side).
 */
export default async function SitePacksPage() {
  await requireAdmin();
  const enabled = !!(brand.features as { sitePack?: boolean }).sitePack;

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

      {enabled ? (
        <SitePackWizard currentMode={brand.mode} />
      ) : (
        <AdminCard title="SitePack is turned off">
          <p className="text-sm text-sol-ink/70">
            Enable the <strong>sitePack</strong> feature to export or restore site snapshots.
          </p>
          <div className="mt-4">
            <AdminButton href="/admin/features" variant="secondary">
              Open Features
            </AdminButton>
          </div>
        </AdminCard>
      )}
    </div>
  );
}
