// Shim for `next/font/google` in Vitest. next/font is a build-time transform
// that isn't available in the Node test runtime, so importing a design pack that
// loads fonts via next/font (e.g. designs/engineered) crashes the suite when the
// design registry is pulled in transitively (tool registry, etc.). We return the
// shape next/font produces ({ className, variable, style }) but inert. Same
// pattern as tests/shims/next-navigation.ts.
//
// Add a font's named export here when a new design pack imports it from
// next/font/google (named imports need a matching named export in ESM).
type FontResult = { className: string; variable: string; style: { fontFamily: string } };
const font = (): FontResult => ({ className: "", variable: "", style: { fontFamily: "" } });

export const Bricolage_Grotesque = font;
export const Hanken_Grotesk = font;
export const JetBrains_Mono = font;
export const Geist = font;
export const Geist_Mono = font;
export const Space_Grotesk = font;
export const Space_Mono = font;
export const Instrument_Serif = font;
export const Instrument_Sans = font;
export const Fraunces = font;
export const Sora = font;
export const Manrope = font;
export const Syne = font;
export const Unbounded = font;
export const DM_Sans = font;
export const DM_Mono = font;
export const Archivo = font;
export const IBM_Plex_Mono = font;
export const IBM_Plex_Sans = font;
export const Libre_Franklin = font;
export const Playfair_Display = font;
export const Plus_Jakarta_Sans = font;
export const Outfit = font;
export const Figtree = font;
export const Lora = font;
export const Newsreader = font;
export const Inter = font;
export const Inter_Tight = font;
export const Spline_Sans_Mono = font;
export const Bricolage = font;
export const Montserrat = font;
export const Oswald = font;
