import localFont from "next/font/local";
import "./faces.css";

// Space Grotesk (FONT1; designs/brutalist). A binding cannot carry the space: the face is
// declared under the real name, which the variable lists after the inert binding.
export const SpaceGrotesk = localFont({
  src: [
    { path: "./space-grotesk-latin-normal-400_500_700.woff2", weight: "400", style: "normal" },
    { path: "./space-grotesk-latin-normal-400_500_700.woff2", weight: "500", style: "normal" },
    { path: "./space-grotesk-latin-normal-400_500_700.woff2", weight: "700", style: "normal" },
  ],
  declarations: [
    { prop: "font-family", value: "Space Grotesk" },
    { prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" },
  ],
  adjustFontFallback: false,
  fallback: ["Space Grotesk", "Space Grotesk Fallback"],
  display: "swap",
  variable: "--font-space-grotesk",
});
