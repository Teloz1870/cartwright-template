import { prisma } from "@/lib/db";
import { brand } from "@/brand.config";
import { DESIGN_OPTIONS, inferDesignFromIndustry } from "@/designs/options";
import { getDesign } from "@/designs";
import DesignSelector from "./DesignSelector";
import DesignUploader from "./DesignUploader";

/**
 * Design-management panel — tidligere indholdet af /admin/designs.
 *
 * v0.25.x: foldet ind i /admin/indstillinger som "Designs"-tab (Udseende-hub).
 * Selve ruten /admin/designs redirecter nu hertil. Panelet er stadig en Server
 * Component der SSR-fetcher current settings; interaktion (radio + upload) lever
 * i Client Components (DesignSelector, DesignUploader).
 */
export default async function DesignsPanel() {
  const settings = await prisma.brandingSettings.findFirst({
    select: {
      designSlug: true,
      industryTemplate: true,
      ecommerceEnabled: true,
    },
  });

  const activeSlug =
    settings?.designSlug ??
    inferDesignFromIndustry(
      settings?.industryTemplate ?? brand.industryTemplate,
      settings?.ecommerceEnabled ?? brand.ecommerceEnabled,
    );
  const isInferred = !settings?.designSlug;
  const cartwrightPlus = brand.features.cartwrightPlus;

  // Filtrér: vis kun designs der matcher shoppens mode (ecommerce eller website)
  const ecommerceEnabled = settings?.ecommerceEnabled ?? brand.ecommerceEnabled;
  const visibleDesigns = DESIGN_OPTIONS.filter((d) =>
    ecommerceEnabled ? d.mode !== "website" : d.mode !== "webshop",
  );

  // v0.9.4: per-design palette-swatches på kortene → kunden ser farverne før
  // aktivering. Hentes server-side fra registry (DesignPack.tokens.palette).
  const palettes: Record<string, string[]> = {};
  for (const d of visibleDesigns) {
    const pack = getDesign(d.slug);
    if (pack) {
      const p = pack.tokens.palette;
      palettes[d.slug] = [p.accent, p.accentDeep, p.cream, p.sand, p.ink, p.muted];
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <header>
        <h2 className="text-2xl font-black text-sol-ink dark:text-white">Designs</h2>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted dark:text-white/60">
          Vælg det visuelle udtryk for din shop. Independent fra industry-template
          (som styrer seed-data — products, categories, pages). Importer flere
          designs fra <strong>Gemini Stitch</strong>, <strong>Claude Design</strong> eller
          <strong> v0</strong> via drag-drop eller{" "}
          <code className="rounded bg-sol-sand px-1.5 py-0.5 text-xs">
            npx cartwright design import
          </code>
          .
        </p>
        {isInferred ? (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-sol-sun/20 px-3 py-1 text-xs font-bold uppercase tracking-widest text-sol-ink dark:bg-white/10 dark:text-white">
            <span>Auto-mode aktiv</span>
            <span className="text-sol-muted dark:text-white/60">
              · Resolver: <code>{activeSlug}</code> (inferred from industry &amp; mode)
            </span>
          </p>
        ) : (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-sol-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-sol-accent">
            <span>Eksplicit valgt</span>
            <span className="text-sol-muted dark:text-white/60">
              · <code>{activeSlug}</code>
            </span>
          </p>
        )}
      </header>

      <section className="flex flex-col gap-4">
        <h3 className="text-xl font-black text-sol-ink dark:text-white">
          Installed designs ({visibleDesigns.length})
        </h3>
        <DesignSelector
          designs={visibleDesigns}
          activeSlug={activeSlug}
          isInferred={isInferred}
          cartwrightPlus={cartwrightPlus}
          palettes={palettes}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-xl font-black text-sol-ink dark:text-white">
          Importer ny design
        </h3>
        <p className="max-w-2xl text-sm text-sol-muted dark:text-white/60">
          Drag-drop en <code>design.md</code> fil. Vælg adapter hvis filen kommer
          fra Gemini Stitch eller Claude Design / v0 (auto-detect virker for
          ~80% af tilfælde, men explicit valg er sikrere).
        </p>
        <DesignUploader ecommerceEnabled={ecommerceEnabled} />
      </section>

      <section className="rounded-2xl border border-sol-ink/10 bg-sol-sand p-6 text-sm leading-relaxed text-sol-muted dark:border-white/10 dark:bg-sol-sand dark:text-white/60">
        <h3 className="mb-2 text-base font-black uppercase tracking-wide text-sol-ink dark:text-white">
          Hvor får jeg en design.md fil fra?
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Generer i Gemini Stitch:</strong>{" "}
            <a
              href="https://stitch.google/"
              target="_blank"
              rel="noreferrer"
              className="text-sol-accent hover:underline"
            >
              stitch.google
            </a>
            {" "}— eksportér som <code>design.md</code>, upload her med &quot;Stitch&quot; adapter.
          </li>
          <li>
            <strong>Brug Claude Design eller v0:</strong> Beskriv ønsket UI →
            gem den genererede <code>.tsx</code> fil → upload her med &quot;Claude Design / v0&quot;
            adapter (vi scrape tokens automatisk).
          </li>
          <li>
            <strong>Hånd-skriv en fra scratch:</strong> Se{" "}
            <code>designs/studio/design.md</code> som template og kopier strukturen.
          </li>
        </ul>
      </section>
    </div>
  );
}
