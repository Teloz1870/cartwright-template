/**
 * Re-export shim — the hoptify admin server action moved to the hoptify plugin
 * (plugins/hoptify/admin/actions.ts, cartwright-plugin-v1). Keeps the
 * historical import path working unchanged for existing scaffolds.
 */
export { migrateAction } from "@/plugins/hoptify/admin/actions";
