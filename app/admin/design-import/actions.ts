/**
 * Re-export shim — the design-import server actions moved to the
 * design-import plugin (plugins/design-import/admin/actions.ts,
 * cartwright-plugin-v1). Keeps the historical import path working unchanged
 * for existing scaffolds.
 */
export { extractAction, applyAction } from "@/plugins/design-import/admin/actions";
