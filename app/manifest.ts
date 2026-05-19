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
    theme_color: "#1e3f5a", // matcher --color-sol-accent
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
