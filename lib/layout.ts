import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import type { LayoutConfig } from "@/designs/layout-types";

export const layoutConfigSchema = z.object({
  sections: z
    .array(
      z.object({
        key: z.string(),
        enabled: z.boolean().default(true),
      }),
    )
    .min(1),
}).superRefine((config, ctx) => {
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

let cache: { value: LayoutConfig | null; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

export async function getActiveLayout(): Promise<LayoutConfig | null> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;

  try {
    const row = await prisma.brandingSettings.findUnique({
      where: { id: 1 },
      select: { layoutJson: true },
    });
    const layout = parseLayoutJson(row?.layoutJson);
    cache = { value: layout, expiresAt: now + CACHE_TTL_MS };
    return layout;
  } catch {
    cache = { value: null, expiresAt: now + CACHE_TTL_MS };
    return null;
  }
}

export function invalidateLayoutCache(): void {
  cache = null;
}
