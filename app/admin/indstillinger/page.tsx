import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/brand";
import { brand as brandConfig } from "@/brand.config";
import {
  identityLockNotice,
  sovereignEcommerce,
  sovereignStoreName,
} from "@/lib/identity";
import AdminTabs, { type AdminTab } from "@/components/admin/AdminTabs";
import { AdminPageHeader } from "@/components/admin/ui";
import BrandingForm from "./BrandingForm";
import LogoForm from "./LogoForm";
import ThemeForm from "./ThemeForm";
import DesignsPanel from "../designs/DesignsPanel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Settings | Cartwright",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const brand = await getBrand();
  const settings = await prisma.brandingSettings.findUnique({ where: { id: 1 } });
  const initialTab = (await searchParams)?.tab;

  const tabs: AdminTab[] = [
    {
      id: "branding",
      label: "Branding",
      content: (
        <div className="flex flex-col gap-8">
          <BrandingForm
            // Deliberately the STORED row, not the resolved value: a form that
            // shows a resolved value lies about what saving would do. When the
            // two differ, `identityLockNotice` explains why — that gap is what
            // sent a fork's operator debugging the storefront.
            initialStoreName={settings?.storeName ?? brand.storeName}
            initialEcommerceEnabled={
              settings?.ecommerceEnabled ?? brandConfig.ecommerceEnabled
            }
            identityLockNotice={identityLockNotice()}
            // Resolved through the same helpers the seam uses, so the "the site
            // renders X" line can never disagree with what the site renders —
            // including the website-mode case where an incoherent config says
            // one thing and the guarantee says another.
            effectiveStoreName={sovereignStoreName(settings?.storeName)}
            effectiveEcommerceEnabled={sovereignEcommerce(settings?.ecommerceEnabled)}
            initialWebsiteHeadline={settings?.websiteHeadline}
            initialHeroCta={settings?.heroCta}
            initialDefaultLocale={settings?.defaultLocale ?? brandConfig.defaultLocale}
          />

          <LogoForm
            initialPaths={brand.logo.markPaths}
            initialViewBox={brand.logo.markViewBox}
            initialStrokeWidth={brand.logo.markStrokeWidth}
            initialImageUrl={brand.logo.imageUrl ?? null}
            logoGeneratorEnabled={Boolean(
              (brandConfig.features as { logoGenerator?: boolean }).logoGenerator,
            )}
          />
        </div>
      ),
    },
    {
      id: "tema",
      label: "Theme",
      content: <ThemeForm initialVibeHtml={null} />,
    },
    {
      id: "designs",
      label: "Designs",
      content: <DesignsPanel />,
    },
  ];

  return (
    <div className="max-w-3xl space-y-8">
      <AdminPageHeader
        title="Appearance & settings"
        subtitle="Branding, theme and design for your Cartwright platform."
      />

      <AdminTabs tabs={tabs} initialTab={initialTab} />
    </div>
  );
}
