/**
 * Re-export shim — the implementation moved to the three-scenes plugin
 * (plugins/three-scenes/, cartwright-plugin-v1). Keeps the historical import
 * path (`@/components/ThreeHero`) working unchanged for existing scaffolds and
 * the design packs that mount the 3D hero behind `brand.features.threeD`.
 */
export { ThreeHero } from "@/plugins/three-scenes/components/ThreeHero";
