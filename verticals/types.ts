/**
 * Vertical / Voice presets — the "pre-genome" layer of the Page Mixer.
 *
 * A Vertical is a packaged BRAND VOICE for an industry (kindergarten, carpenter,
 * café, salon…): identity anchors + pre-written, on-voice genome copy + a
 * suggested design (Skin). Applying one re-tones the homepage WITHOUT an LLM
 * (the copy is shipped), and it's orthogonal to the design — mix any Voice with
 * any (mixable) Skin.
 *
 * Registry convention mirrors designs/{index,options}.ts exactly:
 *   - verticals/index.ts     — server registry (getVertical) + full presets
 *   - verticals/options.ts   — client-safe metadata (no genome/identity bodies)
 *   - verticals/<slug>/preset.ts — one VerticalPreset per file
 *
 * Type-only imports of GenomeFieldKey / GenomeAnchorKey erase at compile, so this
 * file (and options.ts) carry no server-only runtime coupling.
 */
import type { GenomeFieldKey } from "@/lib/genome/fields";
import type { GenomeAnchorKey } from "@/lib/genome/types";
import type { ThemePalette } from "@/lib/theme";
import type { SceneId } from "@/lib/three/types";

export type VerticalPreset = {
  /** kebab-case, unique across verticals. */
  slug: string;
  /** Human name shown in admin + marketplace (e.g. "Kindergarten / Børnehave"). */
  name: string;
  description: string;
  /** Free-text search tags for the gallery. */
  keywords: string[];
  /**
   * Identity anchors. tone/audience/formality MUST be valid IDENTITY_OPTIONS
   * (lib/genome/identity.ts); vibe is free-form (2-40 chars). Applied by merging
   * into genomeJson.identity, so the LLM resolver (if/when triggered) speaks in
   * this voice too.
   */
  identity: Partial<Record<GenomeAnchorKey, string>>;
  /**
   * Pre-written, on-voice genome field overrides. Keys must be GenomeFieldKey;
   * values must satisfy each field's schema. Applied as genomeJson.overrides, so
   * the homepage re-tones immediately on apply — no LLM needed.
   */
  genomeOverrides: Partial<Record<GenomeFieldKey, string>>;
  /**
   * Suggested design pack (Skin) for the "ready-made look". Optional + graceful:
   * apply skips it if the slug isn't in the design registry (e.g. before a new
   * skin like "jungle" ships).
   */
  suggestedDesignSlug?: string;
  /**
   * The full VIBE: a Voice can also carry a brand PALETTE (6 colours → applied as
   * themeJson, so the whole shop — incl. the palette-reactive 3D scene — adopts
   * these colours) and a 3D SCENE (the Live Canvas hero). Applied together with
   * the Skin so "Voice + Skin" sets copy + colours + 3D in one click. Both
   * optional; the palette also drives the 3D effect since scenes read --color-sol-*.
   */
  palette?: ThemePalette;
  scene?: SceneId;
};

/** Client-safe metadata derived from a preset (no genome/identity bodies). */
export type VerticalOption = {
  slug: string;
  name: string;
  description: string;
  keywords: string[];
  suggestedDesignSlug?: string;
};
