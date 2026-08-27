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
 * Design management panel — formerly the contents of /admin/designs.
 *
 * v0.25.x: folded into /admin/indstillinger as the "Designs" tab (Appearance hub).
 * Selve ruten /admin/designs redirecter nu hertil. Panelet er stadig en Server
 * A component that SSR-fetches the current settings; interaction (radio + upload) lives
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

  // Show only designs that match the shop's mode (ecommerce or website).
  const visibleDesigns = DESIGN_OPTIONS.filter((d) =>
    ecommerceEnabled ? d.mode !== "website" : d.mode !== "webshop",
  );

  // Mixer 2.0 Phase 1 — chrome-part picker data. Options = every chrome that
  // is selectable on the ACTIVE design (mixable cw-* chromes on mixable
  // designs + the active design's own chrome). Current selection is parsed
  // fail-soft against the same rule, so a stale key shows as "Design default".
  // The active PACK (not just its slug) so a design that declares its own
  // `mixable` — one of the two ways a pack can say "my tokens are cw-coherent",
  // the other being MIXABLE_DESIGN_SLUGS — is honoured in the picker too, not
  // only in the slug set. Caveat: the slug comes from `resolveStoreIdentity`
  // here while the render path resolves through `getActiveDesign`; on a shop
  // whose BrandingSettings row has drifted those two can name different
  // designs, and this picker then describes that other pack. Pre-existing to
  // this wiring — the picker has always used the identity resolution.
  const activePackMixable = getDesign(activeSlug)?.mixable;
  const chromeOptions = CHROME_CATALOG.filter((meta) =>
    isChromeSelectable(meta, activeSlug, activePackMixable),
  );
  const chromeHeaders = chromeOptions.filter((meta) => meta.kind === "header");
  const chromeFooters = chromeOptions.filter((meta) => meta.kind === "footer");
  const chromeConfig = parseChromeConfig(chromeRow?.chromeJson, activeSlug, activePackMixable);

  // v0.9.4: per-design palette swatches on the cards → the customer sees the colours before
  // activation. Fetched server-side from the registry (DesignPack.tokens.palette).
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
          Choose the visual style for your shop. Independent of the industry template
          (which controls seed data — products, categories, pages). Import more
          designs from <strong>Gemini Stitch</strong>, <strong>Claude Design</strong> or
          <strong> v0</strong> via drag-and-drop or{" "}
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
            <span>Explicitly selected</span>
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
          Drag and drop a <code>design.md</code> file. Choose an adapter if the file comes
          from Gemini Stitch or Claude Design / v0 (auto-detect works for
          ~80% of cases, but an explicit choice is safer).
        </p>
        <DesignUploader ecommerceEnabled={ecommerceEnabled} />
        <DesignPromptForm />
      </section>

      <section className="rounded-2xl border border-sol-ink/10 bg-sol-sand p-6 text-sm leading-relaxed text-sol-muted">
        <h3 className="mb-2 text-base font-black uppercase tracking-wide text-sol-ink">
          Where do I get a design.md file?
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
            {" "}— export as <code>design.md</code>, upload it here with the &quot;Stitch&quot; adapter.
          </li>
          <li>
            <strong>Use Claude Design or v0:</strong> Describe the UI you want →
            save the generated <code>.tsx</code> file → upload it here with &quot;Claude Design / v0&quot;
            adapter (we scrape the tokens automatically).
          </li>
          <li>
            <strong>Write one by hand:</strong> See{" "}
            <code>designs/studio/design.md</code> as a template and copy the structure.
          </li>
        </ul>
      </section>
    </div>
  );
}
