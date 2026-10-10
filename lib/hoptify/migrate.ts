/**
 * Re-export shim — the implementation moved to the hoptify plugin
 * (plugins/hoptify/, cartwright-plugin-v1). Keeps the historical import path
 * (`@/lib/hoptify/migrate`) working unchanged for existing scaffolds and tests.
 */
export { migrateFromShopify } from "@/plugins/hoptify/lib/migrate";
export type { MigrateInput, MigrateResult } from "@/plugins/hoptify/lib/migrate";
