/**
 * Re-export shim — the implementation moved to the design-import plugin
 * (plugins/design-import/, cartwright-plugin-v1). Keeps the historical import
 * path (`@/lib/design-import/apply`) working unchanged for existing scaffolds,
 * the core design tools (lib/tools/design.ts), the hoptify plugin and tests.
 */
export { applyDesignPalette } from "@/plugins/design-import/lib/apply";
