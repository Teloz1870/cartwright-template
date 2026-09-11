import "server-only";

import { getDesign } from "@/designs";
import type { DesignPack } from "@/designs/types";
import { serializeDesignMd } from "./serializer";
import type { DesignMdSpec } from "./spec";

/**
 * Design EXPORT — the missing half of the import flow (lib/designs/codegen.ts).
 * Serializes a registered DesignPack back to a cartwright-design-v1 `design.md`
 * so designs can be downloaded + shared (and re-imported on another shop).
 *
 * Two paths:
 *  1. If the pack's `design.md` is on the runtime filesystem (dev / full source
 *     tree, e.g. codegen/imported packs), return it verbatim — a faithful
 *     round-trip including section data.
 *  2. Otherwise (code-built packs whose homepage is bespoke TSX, or a read-only
 *     prod bundle), synthesize a tokens + identity export from the in-memory
 *     DesignPack. This carries the palette/fonts/identity (import to adopt the
 *     look-and-feel via applyPaletteAsTheme); the bespoke layout stays in source.
 */

function packToSpec(pack: DesignPack): DesignMdSpec {
  return {
    schema: "cartwright-design-v1",
    slug: pack.slug,
    name: pack.name.slice(0, 80),
    description: pack.description.slice(0, 280),
    mode: pack.mode,
    premium: pack.premium ?? false,
    tokens: {
      prefix: pack.tokens.prefix,
      palette: pack.tokens.palette,
      ...(pack.tokens.fonts ? { fonts: pack.tokens.fonts } : {}),
      ...(pack.tokens.extraTokens ? { extraTokens: pack.tokens.extraTokens } : {}),
    },
    sections: [
      {
        type: "opaque",
        component: "BespokeHomepage",
        props: {
          note:
            `The "${pack.slug}" homepage is bespoke code (designs/${pack.slug}/homepage.tsx). ` +
            "This export carries the palette, fonts and identity so you can adopt the " +
            "look-and-feel via import; the full layout lives in the pack's source.",
        },
      },
    ],
  };
}

function packBody(pack: DesignPack): string {
  return [
    `# ${pack.name}`,
    "",
    pack.description,
    "",
    "Exported from the Cartwright design registry. The tokens (palette + fonts)",
    `import cleanly; the homepage layout is bespoke code in designs/${pack.slug}/.`,
    "",
  ].join("\n");
}

export async function exportDesignMd(slug: string): Promise<string | null> {
  const pack = getDesign(slug);
  if (!pack) return null;

  // Prefer the faithful on-disk design.md when present.
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const file = path.join(process.cwd(), "designs", slug, pack.source || "design.md");
    const raw = await fs.readFile(file, "utf8");
    if (raw.trim()) return raw;
  } catch {
    /* not on the runtime FS — fall back to the in-memory tokens export */
  }

  return serializeDesignMd(packToSpec(pack), packBody(pack));
}
