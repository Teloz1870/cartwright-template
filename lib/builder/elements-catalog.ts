/**
 * Cartwright Elements — the pro 3D & cinematic building blocks you can drop
 * into any design (the engine's premium parts/scenes, as gallery data).
 *
 * CLIENT-SAFE pure data — single source of truth for the cartwright.app
 * Elements gallery, emitted via the marketplace manifest (`elements`). Preview
 * paths reference committed assets in the cartwright.app repo under
 * apps/web/public/ (the app owns the captures; the engine owns the catalogue).
 */

export type ElementEntry = {
  slug: string;
  name: string;
  description: string;
  /** Short vibe tag for the gallery. */
  vibe: string;
  /** Poster image path under the app's public/. */
  previewImage: string;
  /** Optional hover-video path (webm; an .mp4 sibling is assumed). */
  previewVideo?: string;
};

export const ELEMENTS_CATALOG: ElementEntry[] = [
  {
    slug: "hero-aurora",
    name: "Live-Canvas hero",
    description:
      "3D Live-Canvas hero — any of the 9 palette-reactive scenes behind your headline. One shared WebGL renderer, reduced-motion / saveData-gated, lazy-loaded.",
    vibe: "premium · 3D",
    previewImage: "/scenes/aurora.jpg",
    previewVideo: "/scenes/aurora.webm",
  },
  {
    slug: "butterflies-hero",
    name: "Butterfly flock hero",
    description:
      "The FABLE instanced butterfly flock hero — procedural wings, flap-and-glide flight, scattering from the pointer. Palette-tinted to your brand.",
    vibe: "organic · metamorphosis",
    previewImage: "/designs/fable.jpg",
    previewVideo: "/designs/fable.webm",
  },
  {
    slug: "showroom-3d",
    name: "3D showroom",
    description:
      "Rotatable 3D product showroom with spec rail — drag to orbit the hero product while the specs track alongside.",
    vibe: "product · 3D",
    previewImage: "/designs/apex.jpg",
    previewVideo: "/designs/apex.webm",
  },
  {
    slug: "configurator",
    name: "Configurator",
    description:
      "Build-your-own with live price — pure CSS :has(), zero JavaScript. Options update the summary and total as you pick.",
    vibe: "interactive · CSS-only",
    previewImage: "/designs/apex.jpg",
  },
  {
    slug: "scroll-cinema",
    name: "Scroll cinema",
    description:
      "Scroll-driven story — native animation-timeline: view(). Scenes pin, fade and hand off as you scroll, no scroll-jacking library.",
    vibe: "cinematic · scroll",
    previewImage: "/designs/apex.jpg",
  },
  {
    slug: "stat-band",
    name: "Stat band",
    description:
      "Editorial stat band — oversized numerals with measured captions, the magazine-spread proof row for any landing page.",
    vibe: "editorial",
    previewImage: "/designs/fable.jpg",
  },
];
