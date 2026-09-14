/**
 * Re-export shim — the migration client component moved to the hoptify plugin
 * (plugins/hoptify/admin/HopMigrate.tsx, cartwright-plugin-v1). Keeps the
 * historical import path working unchanged for existing scaffolds.
 */
export { HopMigrate } from "@/plugins/hoptify/admin/HopMigrate";
