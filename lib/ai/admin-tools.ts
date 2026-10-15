/**
 * The admin assistant's tool allowlist + its confirmation gate — PURE DATA.
 *
 * Lives apart from lib/ai/client.ts (server-only: Prisma, the AI SDK) so it
 * can be read without booting the AI stack: `scripts/gen-marketplace-manifests.ts`
 * derives `engineFacts.adminToolCount` / `confirmGatedCount` from these two
 * lists for cartwright.app, and a standalone tsx script cannot import a
 * server-only module. client.ts re-exports everything here, so every existing
 * import path still works. No `server-only` import on purpose; nothing here
 * is secret or heavy.
 */

/**
 * Tools admin-chatten (/admin/ai) kan kalde. Inkluderer både læse- og
 * skrive-tools fra alle admin-domæner. Eksplicit eksklusiv: cart.* (kunde-
 * domæne) og discounts.try_apply (kunde-only preview).
 *
 * **Hold synkroniseret med ADMIN_CHAT_SCOPES i lib/scopes.ts**: hvert tool
 * her skal have et scope der findes i den scope-liste, ellers returnerer
 * invokeTool 403 selv om allowlisten siger ja.
 */
export const ADMIN_TOOL_ALLOWLIST = [
  // Read-tools — kalder direkte
  "products.search",
  "products.get",
  "categories.list",
  "pages.list",
  "orders.list",
  "orders.get",
  "discounts.list",
  "analytics.summary",
  "audit.list",
  "settings.get",
  // Write-tools — kræver plan-først-confirmation (CONFIRM_REQUIRED)
  "products.create",
  "products.update",
  "products.delete",
  "categories.upsert",
  "categories.delete",
  "pages.upsert",
  "pages.delete",
  "discounts.create",
  "discounts.toggle",
  "orders.update_status",
  "settings.update_shipping",
  "settings.update_branding",
  "settings.update_copy",
  "marketing.create_campaign",
  "docs.import",
  "audit.revert",
  // Billed-håndtering — IKKE i CONFIRM_REQUIRED da search er read-only og
  // attach_image er additivt (ikke destructive).
  "images.search_unsplash",
  "products.attach_image",
  // Agentic build — compose a look (Skin × Voice) + the prompt-driven page
  // builder. Read-only planners need no confirm; the writes are confirm-gated
  // below. Shopper chat NEVER gets these (composing a site is an owner task).
  "magic.plan_page",
  "magic.generate_page",
  "vertical.apply",
  "design.set_slug",
  "magic.compose_look",
  "chrome.set",
  "pages.set_layout",
  // Composition artifact (Mixer 2.0 Phase 2) — export is read-only; apply is
  // confirm-gated below.
  "composition.export",
  "composition.apply",
  // Mockup-first — publish/clear a raw-HTML homepage mockup (vibe takeover).
  // Owner-only build capability; both writes are confirm-gated below.
  "mockup.set",
  "mockup.clear",
  // Bulk redirect import (CSV) — the migration path's "old URLs in before the
  // DNS switch". A real import is confirm-gated below; a dry run is a read
  // and runs directly (READ_ONLY_WHEN).
  "redirects.import",
] as const;

export type AdminToolName = (typeof ADMIN_TOOL_ALLOWLIST)[number];

export function isAdminTool(name: string): name is AdminToolName {
  return (ADMIN_TOOL_ALLOWLIST as readonly string[]).includes(name);
}

/**
 * Tools der KRÆVER plan-først-confirmation før de eksekveres. AI'ens første
 * kald returnerer { requiresConfirmation: true } uden side-effects; admin
 * klikker bekræft → nyt request med confirm:true → server udfører.
 *
 * **Vigtigt:** AI'en kan ikke selv "tilføje confirm:true" og dermed bypasse
 * — confirmation håndhæves som server+client handshake, ikke som arg-flag.
 */
export const CONFIRM_REQUIRED: ReadonlySet<AdminToolName> = new Set([
  "products.create",
  "products.update",
  "products.delete",
  "categories.upsert",
  "categories.delete",
  "pages.upsert",
  "pages.delete",
  "discounts.create",
  "discounts.toggle",
  "orders.update_status",
  "settings.update_shipping",
  "settings.update_branding",
  "settings.update_copy",
  "marketing.create_campaign",
  "docs.import",
  "audit.revert",
  // Agentic build — every write here is confirm-gated + audited + revertible.
  "vertical.apply",
  "design.set_slug",
  "magic.compose_look",
  "chrome.set",
  "pages.set_layout",
  "composition.apply",
  // Mockup-first — both writes take over / restore the live homepage.
  "mockup.set",
  "mockup.clear",
  // Bulk redirect import — rewrites the live redirect table in one go.
  "redirects.import",
]);

/**
 * The call shapes of a confirm-gated tool that are READS and skip the plan
 * card, per tool. `redirects.import` with `dryRun: true` writes nothing — it IS
 * the preview the card stands in for, so the card would only hide it. The
 * tool's own Zod refine still gates REST/MCP; only a strict `true` is a read.
 */
export const READ_ONLY_WHEN: Partial<Record<AdminToolName, (args: Record<string, unknown>) => boolean>> = {
  "redirects.import": (a) => a.dryRun === true,
};

/** Whether THIS call needs the plan-first card: gated by name, unless its shape is a read. */
export function needsConfirmation(name: string, args: unknown): boolean {
  if (!CONFIRM_REQUIRED.has(name as never)) return false;
  const isRead = READ_ONLY_WHEN[name as AdminToolName];
  return !isRead?.((args ?? {}) as Record<string, unknown>);
}
