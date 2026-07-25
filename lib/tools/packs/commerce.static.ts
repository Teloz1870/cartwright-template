import "server-only";

import type { AnyTool } from "@/lib/tools/types";

/**
 * B3 static seam variant — commerce tool packs WITHOUT a webshop
 * (site-profile program, `internal-docs/site-profile-ultraplan.md` §5).
 *
 * Exports the same names as the db/webshop variant (commerce.ts) but as
 * empty packs: a managed-site materialization (mcp + db + admin, no webshop)
 * swaps this file over the seam target and the tool registry composes
 * without the commerce packs (products/orders/discounts/categories/customer/
 * address/subscriptions/analytics/marketing/ui/scraper) — those tools are
 * absent from the list and invoke → 404 via the registry's normal not-found
 * path. NOTE: this removes the packs routed through the SEAM; the
 * model-COUPLED packs that stay shared (audit/settings/sitepack/gdpr) and
 * the plugin-coupled ones (posts, google/sheets/docs/drive) are tracked in
 * the mcp module's knownDeviations, not here.
 *
 * NOTHING in the engine imports this file today — it exists for the B3
 * materializer. The engine stays byte-identical until a materializer performs
 * the swap. NOTE (ledger): swapping the seam removes the tools from the
 * REGISTRY, but the pack FILES still live inside mcp's monolithic lib/tools
 * claim — the materializer must also exclude those files (tracked in the mcp
 * module's knownDeviations).
 */
export const productsTools: readonly AnyTool[] = [];
export const ordersTools: readonly AnyTool[] = [];
export const discountsTools: readonly AnyTool[] = [];
export const categoriesTools: readonly AnyTool[] = [];
export const customerTools: readonly AnyTool[] = [];
export const addressTools: readonly AnyTool[] = [];
export const subscriptionsTools: readonly AnyTool[] = [];
export const analyticsTools: readonly AnyTool[] = [];
export const marketingTools: readonly AnyTool[] = [];
export const uiTools: readonly AnyTool[] = [];
export const scraperTools: readonly AnyTool[] = [];
