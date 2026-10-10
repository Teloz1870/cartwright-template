import "server-only";

import type { SectionKey } from "@/lib/builder/section-registry";
import type { GeneratedSection } from "@/lib/magic/types";
import { getBrand } from "@/lib/brand";
import { generateV0Section } from "@/lib/v0/client";
import { extractHtmlFromV0Files } from "@/lib/v0/transform/extract";
import { sanitizeUserHtml } from "@/lib/v0/transform/sanitize-strict";
import { buildV0System } from "@/lib/magic/reskin";

/**
 * v0 source — the admin-reviewed, quota-limited BESPOKE escape hatch (honestly
 * second-class, not the default beautiful source).
 *
 * v0 emits free-form HTML, so this ALWAYS produces a governed `vibe` section
 * regardless of the planned key. The HTML passes through the STRICT allowlist
 * sanitizer at ingest (sanitize-strict, not the regex) before it can become
 * data. Gated by brand.features.v0Generator; the daily-quota guard lives inside
 * generateV0Section so a runaway loop fails cheap.
 */
export async function generateVibeSection(
  _key: SectionKey,
  prompt: string,
): Promise<GeneratedSection> {
  const brand = await getBrand();
  if (!brand.features.v0Generator) {
    throw new Error(
      "v0-generering er ikke aktiveret. Slå 'v0 UI-generering' til i /admin/features.",
    );
  }
  const system = await buildV0System(brand.storeName);
  const result = await generateV0Section({ message: prompt, system });
  const html = await sanitizeUserHtml(extractHtmlFromV0Files(result.files));
  if (!html) {
    throw new Error("v0 returnerede ingen brugbar HTML. Prøv en mere specifik prompt.");
  }
  return { key: "vibe", props: { html } };
}
