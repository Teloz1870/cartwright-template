import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/brand";
import { brand as brandConfig } from "@/brand.config";
import AdminTabs, { type AdminTab } from "@/components/admin/AdminTabs";
import BrandingForm from "./BrandingForm";
import LogoForm from "./LogoForm";
import ThemeForm from "./ThemeForm";
import DesignsPanel from "../designs/DesignsPanel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Indstillinger | Cartwright",
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
            initialStoreName={settings?.storeName ?? brand.storeName}
            initialEcommerceEnabled={settings?.ecommerceEnabled ?? true}
            initialWebsiteHeadline={settings?.websiteHeadline}
            initialHeroCta={settings?.heroCta}
            initialDefaultLocale={settings?.defaultLocale ?? "da"}
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
      label: "Tema",
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
      <div>
        <h1 className="text-3xl font-black text-sol-ink">Udseende & indstillinger</h1>
        <p className="mt-2 text-sol-muted">
          Branding, tema og design for din Cartwright platform.
        </p>
      </div>

      <AdminTabs tabs={tabs} initialTab={initialTab} />
    </div>
  );
}
