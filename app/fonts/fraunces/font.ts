import localFont from "next/font/local";
import "./faces.css";

// Fraunces (FONT1-c; designs/editorial-ink, fable, nocturne, stillwater — the union of their
// weights, one file per style). The binding IS the family name (Turbopack names it so).
// Crema's opsz cut is a different file set: designs/crema/fonts/fraunces.
export const Fraunces = localFont({
  src: [
    { path: "./fraunces-latin-italic-400_500_600.woff2", weight: "400", style: "italic" },
    { path: "./fraunces-latin-italic-400_500_600.woff2", weight: "500", style: "italic" },
    { path: "./fraunces-latin-italic-400_500_600.woff2", weight: "600", style: "italic" },
    { path: "./fraunces-latin-normal-400_500_600.woff2", weight: "400", style: "normal" },
    { path: "./fraunces-latin-normal-400_500_600.woff2", weight: "500", style: "normal" },
    { path: "./fraunces-latin-normal-400_500_600.woff2", weight: "600", style: "normal" },
  ],
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
  adjustFontFallback: false,
  fallback: ["Fraunces Fallback"],
  display: "swap",
  variable: "--font-fraunces",
});
