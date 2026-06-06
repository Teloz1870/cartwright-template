import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/brand";
import { brand as brandConfig } from "@/brand.config";
import BrandingForm from "./BrandingForm";
import LogoForm from "./LogoForm";
import ThemeForm from "./ThemeForm";

export const metadata = {
  title: "Indstillinger | Cartwright",
};

export default async function SettingsPage() {
  const brand = await getBrand();
  // We can fetch raw DB settings to populate form if needed, or use brand.
  const settings = await prisma.brandingSettings.findUnique({ where: { id: 1 } });

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-black text-sol-ink">Indstillinger</h1>
        <p className="mt-2 text-sol-muted">
          Generelle indstillinger for din Cartwright platform.
        </p>
      </div>
      
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
        logoGeneratorEnabled={Boolean((brandConfig.features as { logoGenerator?: boolean }).logoGenerator)}
      />

      <ThemeForm initialVibeHtml={null} />
    </div>
  );
}
