import { prisma } from "@/lib/db";
import { brand } from "@/brand.config";
import { DESIGN_OPTIONS } from "@/designs/options";
import { getDesign } from "@/designs";
import { resolveStoreIdentity, getFeatures } from "@/lib/brand";
import {
  CHROME_CATALOG,
  isChromeSelectable,
  parseChromeConfig,
} from "@/lib/builder/chrome-catalog";
import DesignSelector from "./DesignSelector";
import DesignUploader from "./DesignUploader";
import DesignPromptForm from "./DesignPromptForm";
import ChromePicker from "./ChromePicker";
import CompositionPorter from "./CompositionPorter";

/**
 * Design-management panel — tidligere indholdet af /admin/designs.
 *
 * v0.25.x: foldet ind i /admin/indstillinger som "Designs"-tab (Udseende-hub).
 * Selve ruten /admin/designs redirecter nu hertil. Panelet er stadig en Server
 * Component der SSR-fetcher current settings; interaktion (radio + upload) lever
 * i Client Components (DesignSelector, DesignUploader).
 */
export default async function DesignsPanel() {
  // chromeJson queried separately + fail-soft so a DB that hasn't run
  // `pnpm db:push` for the Mixer 2.0 column yet still renders the panel
  // (picker simply shows "Design default").
  const settings = await prisma.brandingSettings.findFirst({
    select: {
      designSlug: true,
      industryTemplate: true,
      ecommerceEnabled: true,
    },
  });
  const chromeRow = await prisma.brandingSettings
    .findFirst({ select: { chromeJson: true } })
    .catch(() => null);

  // Use the SAME identity resolution as the homepage (Phase H) so the picker
  // shows the correct mode's designs even if the DB ecommerce flag has drifted,
  // and reflects a brand.config designSlug override as the active selection.
  const {
    ecommerceEnabled,
    designSlug: activeSlug,
    designIsInferred: isInferred,
  } = resolveStoreIdentity(settings);
  const cartwrightPlus = brand.features.cartwrightPlus;

  // Preview link (per design card) → the gated, ephemeral mixer-preview route.
  // Same gate the route enforces (`mixerPreviewEnabled`, on in dev), so we never
  // render a Preview link that would 404. Flag-off ⇒ picker is byte-identical.
  const features = await getFeatures();
  const previewEnabled =
    process.env.NODE_ENV !== "production" || features.mixerPreviewEnabled;

  // Vis kun designs der matcher shoppens mode (ecommerce eller website).
  const visibleDesigns = DESIGN_OPTIONS.filter((d) =>
    ecommerceEnabled ? d.mode !== "website" : d.mode !== "webshop",
  );

  // Mixer 2.0 Phase 1 — chrome-part picker data. Options = every chrome that
  // is selectable on the ACTIVE design (mixable cw-* chromes on mixable
  // designs + the active design's own chrome). Current selection is parsed
  // fail-soft against the same rule, so a stale key shows as "Design default".
  const chromeOptions = CHROME_CATALOG.filter((meta) => isChromeSelectable(meta, activeSlug));
  const chromeHeaders = chromeOptions.filter((meta) => meta.kind === "header");
  const chromeFooters = chromeOptions.filter((meta) => meta.kind === "footer");
  const chromeConfig = parseChromeConfig(chromeRow?.chromeJson, activeSlug);

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
        <h2 className="text-2xl font-black text-sol-ink">Designs</h2>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
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
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-sol-sun/20 px-3 py-1 text-xs font-bold uppercase tracking-widest text-sol-ink">
            <span>Auto-mode aktiv</span>
            <span className="text-sol-muted">
              · Resolver: <code>{activeSlug}</code> (inferred from industry &amp; mode)
            </span>
          </p>
        ) : (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-sol-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-sol-accent">
            <span>Eksplicit valgt</span>
            <span className="text-sol-muted">
              · <code>{activeSlug}</code>
            </span>
          </p>
        )}
      </header>

      <section className="flex flex-col gap-4">
        <h3 className="text-xl font-black text-sol-ink">
          Installed designs ({visibleDesigns.length})
        </h3>
        <DesignSelector
          designs={visibleDesigns}
          activeSlug={activeSlug}
          isInferred={isInferred}
          cartwrightPlus={cartwrightPlus}
          palettes={palettes}
          locale={brand.defaultLocale}
          previewEnabled={previewEnabled}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-xl font-black text-sol-ink">
          Header &amp; footer
        </h3>
        <p className="max-w-2xl text-sm text-sol-muted">
          Mix the chrome independent of the design: pick any palette-adaptive
          header or footer part — or keep the active design&apos;s own.
          &quot;Design default&quot; follows whatever the design ships.
        </p>
        <ChromePicker
          headers={chromeHeaders}
          footers={chromeFooters}
          activeHeaderKey={chromeConfig?.headerKey ?? ""}
          activeFooterKey={chromeConfig?.footerKey ?? ""}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-xl font-black text-sol-ink">
          Compositions
        </h3>
        <p className="max-w-2xl text-sm text-sol-muted">
          A composition is the whole composed look — skin, palette, voice,
          chrome, 3D scene and homepage layout — as one{" "}
          <code className="rounded bg-sol-sand px-1.5 py-0.5 text-xs">
            composition.json
          </code>{" "}
          file. Export this shop&apos;s look, or install one from any other
          Cartwright shop in a single click (audited and revertible).
        </p>
        <CompositionPorter />
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-xl font-black text-sol-ink">
          Importer ny design
        </h3>
        <p className="max-w-2xl text-sm text-sol-muted">
          Drag-drop en <code>design.md</code> fil. Vælg adapter hvis filen kommer
          fra Gemini Stitch eller Claude Design / v0 (auto-detect virker for
          ~80% af tilfælde, men explicit valg er sikrere).
        </p>
        <DesignUploader ecommerceEnabled={ecommerceEnabled} />
        <DesignPromptForm />
      </section>

      <section className="rounded-2xl border border-sol-ink/10 bg-sol-sand p-6 text-sm leading-relaxed text-sol-muted">
        <h3 className="mb-2 text-base font-black uppercase tracking-wide text-sol-ink">
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
