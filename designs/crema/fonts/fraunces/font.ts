import localFont from "next/font/local";
import "./faces.css";

// Fraunces (FONT1-c; designs/crema). Crema's own cut — the opsz axis, one 100–900 file — not the
// app/fonts/fraunces set the other packs share. The binding IS the family name (Turbopack names it so).
export const Fraunces = localFont({
  src: [{ path: "./fraunces-latin-normal-100-900.woff2", weight: "100 900", style: "normal" }],
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
  adjustFontFallback: false,
  fallback: ["Fraunces Fallback"],
  display: "swap",
  variable: "--font-crema-display",
});
