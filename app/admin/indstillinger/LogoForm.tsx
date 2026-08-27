/**
 * Re-export shim — the implementation moved to the logo-generator plugin
 * (plugins/logo-generator/, cartwright-plugin-v1). Keeps the historical
 * import path (`./LogoForm` from the settings page) working unchanged for
 * existing scaffolds.
 */
export { default } from "@/plugins/logo-generator/admin/LogoForm";
