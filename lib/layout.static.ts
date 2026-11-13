import "server-only";

import { z } from "zod";
import type { LayoutConfig } from "@/designs/layout-types";

/**
 * B3 static seam variant — section-layout config WITHOUT a database
 * (site-profile program). The materializer copies this file over
 * `lib/layout.ts` when the db module is not in the profile; NOTHING imports
 * it in the shipped engine (byte-identical until then).
 *
 * No BrandingSettings.layoutJson → there is never an active layout override,
 * so every design (e.g. studio's section ordering) renders its built-in
 * default order — the same render a db profile gives before the admin ever
 * saves a layout. The schema + parser stay identical so shared callers keep
 * validating layout JSON the same way.
 */

export const layoutConfigSchema = z
  .object({
    sections: z
      .array(
        z.object({
          key: z.string(),
          enabled: z.boolean().default(true),
        }),
      )
      .min(1),
  })
  .superRefine((config, ctx) => {
    const seen = new Set<string>();
    for (const section of config.sections) {
      if (seen.has(section.key)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate section key: ${section.key}`,
          path: ["sections"],
        });
        return;
      }
      seen.add(section.key);
    }
  });

export function parseLayoutJson(raw: string | null | undefined): LayoutConfig | null {
  if (!raw) return null;
  try {
    const parsed = layoutConfigSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function getActiveLayout(): Promise<LayoutConfig | null> {
  return null;
}

export function invalidateLayoutCache(): void {
  // No cache without a store.
}
