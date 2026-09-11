/**
 * Re-export shim — the docs-import admin server action moved to the
 * google-workspace plugin (plugins/google-workspace/admin/docs-import/actions.ts,
 * cartwright-plugin-v1). Keeps the historical import path working unchanged
 * for existing scaffolds.
 */
export { importGoogleDocAction } from "@/plugins/google-workspace/admin/docs-import/actions";
export type { DocsImportActionResult } from "@/plugins/google-workspace/admin/docs-import/actions";
