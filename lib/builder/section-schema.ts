/**
 * Visual Builder — page section-tree schema.
 *
 * Et godkendt section-tree er en ordnet liste af nodes; rækkefølgen i arrayet
 * ER render-rækkefølgen (brugeren reorder'er direkte — modsat den globale
 * studio-homepage hvor `resolveSectionOrder` styrer via et fast registry).
 *
 * `key` skal være en whitelisted section-key (lib/builder/section-registry),
 * og `props` valideres mod den pågældende sektions egen Zod-schema — så en
 * AI- eller UI-genereret node ALDRIG kan injicere vilkårlige felter. Mirror af
 * dedupe-mønstret i `layoutConfigSchema` (lib/layout.ts).
 */
import { z } from "zod";
import { SECTION_REGISTRY, isSectionKey } from "./section-registry";

const sectionNodeSchema = z.object({
  /** Stabilt id pr. node (drag/drop-key + dedupe). */
  id: z.string().min(1),
  /** Whitelisted section-key. */
  key: z.string().refine(isSectionKey, "Unknown section key"),
  /** Synlig på storefront. Default true. */
  enabled: z.boolean().default(true),
  /** Valgfri variant-hint (reserveret; ikke brugt af MVP-sektioner endnu). */
  variant: z.string().optional(),
  /** Section-props — valideres mod registry-schema i superRefine nedenfor. */
  props: z.record(z.string(), z.unknown()).optional(),
});

export const pageLayoutSchema = z
  .object({
    sections: z.array(sectionNodeSchema).min(1),
  })
  .superRefine((config, ctx) => {
    const seenIds = new Set<string>();
    config.sections.forEach((section, i) => {
      if (seenIds.has(section.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate section id: ${section.id}`,
          path: ["sections", i, "id"],
        });
      }
      seenIds.add(section.id);

      // key er allerede refined til en gyldig key; valider props mod dens schema.
      if (!isSectionKey(section.key)) return;
      const entry = SECTION_REGISTRY[section.key];
      const parsed = entry.propsSchema.safeParse(section.props ?? entry.defaultProps);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          message: `Invalid props for section '${section.key}': ${
            parsed.error.issues[0]?.message ?? "validation failed"
          }`,
          path: ["sections", i, "props"],
        });
      }
    });
  });

export type PageLayout = z.infer<typeof pageLayoutSchema>;
export type SectionNode = z.infer<typeof sectionNodeSchema>;

/**
 * Parse + valider `Page.layoutJson`. Returnerer null ved tom/invalid input —
 * render-laget falder så tilbage til body/vibeHtml (canary-safe). Mirror af
 * `parseLayoutJson` i lib/layout.ts.
 */
export function parsePageLayout(
  raw: string | null | undefined,
): PageLayout | null {
  if (!raw) return null;
  try {
    const parsed = pageLayoutSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
