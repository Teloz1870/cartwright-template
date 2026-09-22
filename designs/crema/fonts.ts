/**
 * Crema — shared next/font instances.
 *
 * The homepage, the webshop overrides (ProductCard/PdpLayout) and the brew
 * calculator all render OUTSIDE each other's DOM subtrees, so each root must
 * carry the font CSS variables itself. Declaring the fonts once here (next/font
 * dedupes by config, so this is one download regardless of import count) and
 * exporting the combined variable-class keeps every crema surface on the same
 * Fraunces/Instrument Sans/IBM Plex Mono trio.
 */
import { Fraunces, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";

export const cremaDisplay = Fraunces({
  subsets: ["latin"],
  variable: "--font-crema-display",
  axes: ["opsz"],
});

export const cremaSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-crema-sans",
});

export const cremaMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-crema-mono",
});

/** Class string that puts all three crema font variables on an element. */
export const cremaFontVars = `${cremaDisplay.variable} ${cremaSans.variable} ${cremaMono.variable}`;
