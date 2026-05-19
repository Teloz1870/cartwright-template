import { prisma } from "@/lib/db";

const FALLBACK = "Gratis fragt på alle ordrer over 499 kr — hele sommeren ☀️";

export default async function AnnouncementBar() {
  // Læs fra BrandingSettings så marketing.create_campaign slår igennem
  // instant. Hvis settings-row mangler (fx før seed) falder vi tilbage til
  // statisk tekst — siden må aldrig bare crashe pga. manglende settings.
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
        <a
          href="/changelog"
          className="shrink-0 whitespace-nowrap font-black uppercase tracking-[0.2em] text-white/85 underline-offset-4 hover:text-white hover:underline"
        >
          🤖 Drevet af AI · se hvad jeg gør i dag
        </a>
      </div>
    </div>
  );
}
