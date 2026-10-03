import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { getFeatures } from "@/lib/brand";
import { brand } from "@/brand.config";
import { DESIGN_OPTIONS } from "@/designs/options";
import { VERTICAL_OPTIONS } from "@/verticals/options";
import { AdminPageHeader } from "@/components/admin/ui";
import { MixerStudio } from "./MixerStudio";

export const dynamic = "force-dynamic";

/**
 * /admin/mixer — Page Mixer (Phase D, admin half).
 *
 * A read-only studio that lets an admin preview any Skin (design) × Voice
 * (vertical) combination by driving the gated `/<locale>/mixer-preview` route
 * inside an iframe. Picking a Skin/Voice only changes the iframe's query — it
 * writes NOTHING to the DB and never touches the live shop's stored design or
 * genome. The governed "apply for real" paths stay where they are
 * (`/admin/designs` and `/admin/verticals`).
 *
 * Gated behind `mixerPreviewEnabled` (default off) — same gate as the preview
 * route it embeds — so it 404s in production until the flag is on. The nav entry
 * (`lib/admin/nav.ts`) carries the same flag, so flag-off = byte-identical admin.
 */
export default async function AdminMixerPage() {
  await requireAdmin();
  const features = await getFeatures();
  const allowed = process.env.NODE_ENV !== "production" || features.mixerPreviewEnabled;
  if (!allowed) notFound();

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Page Mixer"
        subtitle="Preview any Skin (design) × Voice (vertical) combination live, before you commit to it. This studio is read-only — choosing here changes only the preview, never your live homepage. Apply a look for real from Designs or Verticals (Voice)."
      />
      <MixerStudio
        designs={DESIGN_OPTIONS}
        verticals={VERTICAL_OPTIONS}
        locale={brand.defaultLocale}
      />
    </div>
  );
}
