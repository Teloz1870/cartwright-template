/**
 * Route mount (cartwright-plugin-v1) — logo-generator plugin (SVG outline logo).
 * Handler implementation (incl. the requireAdminApi() guard):
 * plugins/logo-generator/api/generate-logo.ts.
 * Segment config stays literal here for Next's static analysis.
 */
export const dynamic = "force-dynamic";

export { POST } from "@/plugins/logo-generator/api/generate-logo";
