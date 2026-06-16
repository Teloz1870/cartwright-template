import type { MetadataRoute } from "next";
import { brand } from "@/brand.config";

/**
 * Next.js Web App Manifest — auto-genereres som /manifest.json.
 *
 * Theme-color matcher palette i themes/generic.css. Ved fork: opdatér
 * theme_color + background_color så de matcher din nye palette.
 * @theme CSS-vars kan ikke læses i Node-runtime (TS), så hex hardcodes her.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.storeName,
    short_name: brand.storeName,
    description: brand.metadata.description,
    start_url: "/",
    display: "standalone",
    background_color: "#f4efe6", // matcher --color-sol-cream
    theme_color: "#7c5cff", // Cartwright purple (--cw-brand), matcher faviconBg
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
      },
    ],
  };
}
