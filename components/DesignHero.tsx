/**
 * Re-export shim — the implementation moved to the three-scenes plugin
 * (plugins/three-scenes/, cartwright-plugin-v1). Keeps the historical import
 * path (`@/components/DesignHero`) working unchanged for existing scaffolds
 * and the design packs that use the one-line aurora hero.
 */
export { DesignHero } from "@/plugins/three-scenes/components/DesignHero";
