import { prisma } from "@/lib/db";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { brand } from "@/brand.config";
import { profileCapabilities } from "@/lib/profile-capabilities";

const FALLBACK = "Free shipping on all orders over 499 kr - all summer";

export default async function AnnouncementBar() {
  // Læs fra BrandingSettings så marketing.create_campaign slår igennem
  // instant. Hvis settings-row mangler (fx før seed) falder vi tilbage til
  // statisk tekst — siden må aldrig bare crashe pga. manglende settings.
  const t = await getTranslations("AnnouncementBar");
  const locale = await getLocale();
  let announcement = FALLBACK;
  try {
    const branding = await prisma.brandingSettings.findUnique({
      where: { id: 1 },
      select: { announcement: true },
    });
    if (branding?.announcement) announcement = branding.announcement;
  } catch {
    // Stum: hvis DB ikke er tilgængelig på render-tid, vis fallback.
  }

  return (
    <div className="w-full bg-sol-accent text-white">
      <div className="container mx-auto flex flex-col items-center gap-1 px-4 py-2 text-center text-xs font-medium tracking-wide sm:flex-row sm:justify-between sm:gap-4">
        <span className="flex-1 text-center">{announcement}</span>
        {/* Engine-transparency link (brand.website.showAuditFeed). Locale-
            prefixed — the bare `/changelog` href bounced the visitor to the
            default locale (#469's bug class). */}
        {/* `/changelog` is engine-only (scaffold/engine-only.ts) — the CLI
            deletes the route from a customer's scaffold, so the bar must ask
            first. `Boolean(...)`, never `=== true` (#550/#551/#572). */}
        {Boolean(profileCapabilities.engineMarketing) && brand.website.showAuditFeed && (
          <Link
            href={`/${locale}/changelog`}
            className="shrink-0 whitespace-nowrap font-black uppercase tracking-[0.2em] text-white/85 underline-offset-4 hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {t("aiLink")}
          </Link>
        )}
      </div>
    </div>
  );
}
