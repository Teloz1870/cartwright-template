/**
 * Crema — shared next/font instances.
 *
 * The homepage, the webshop overrides (ProductCard/PdpLayout) and the brew
 * calculator all render OUTSIDE each other's DOM subtrees, so each root must
 * carry the font CSS variables itself. Declaring the fonts once (one download
 * regardless of import count) and exporting the combined variable-class keeps
 * every crema surface on the same Fraunces/Instrument Sans/IBM Plex Mono trio.
 *
 * Self-hosted (FONT1-c): each family is fetched once by scripts/fonts/fetch.mjs
 * into the folder next to this file, with its own `font.ts` (the
 * app/fonts/<family>/font.ts pattern), so a build never asks Google for them.
 * They live in the pack, not app/fonts, because the webshop module owns crema.
 *
 * The class string is built at render time, not at import: in the route-handler
 * layer (`/api/admin/designs/[slug]/export` imports every pack) Turbopack drops
 * the import of a next/font/local module that has a single importer, so a
 * module-scope read of `.variable` failed the build with "cremaDisplay is not
 * defined" (measured, Next 16.4.2). A read inside a component never runs there.
 */
import { Fraunces as cremaDisplay } from "./fraunces/font";
import { InstrumentSans as cremaSans } from "./instrument-sans/font";
import { IBMPlexMono as cremaMono } from "./ibm-plex-mono/font";

/** Class string that puts all three crema font variables on an element. */
export const cremaFontVars = () => `${cremaDisplay.variable} ${cremaSans.variable} ${cremaMono.variable}`;
