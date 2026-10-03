/**
 * Re-export shim — the implementation moved to the logo-generator plugin
 * (plugins/logo-generator/, cartwright-plugin-v1). Keeps the historical
 * import path (`@/lib/ai/logo-gen`) working unchanged for existing scaffolds
 * and tests.
 */
export { generateLogoImage } from "@/plugins/logo-generator/lib/logo-gen";
export type { LogoGenResult } from "@/plugins/logo-generator/lib/logo-gen";
