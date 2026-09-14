import "server-only";

/**
 * B3 registry seam — the COMMERCE tool packs (site-profile program + the
 * mcp module's knownDeviations ledger in modules/registry.ts).
 *
 * This file is the seam target `lib/tools/packs/commerce.ts`, declared by the
 * mcp module and provided by the webshop module: pure re-exports of the
 * eleven tool packs that only exist in a webshop — they import webshop lib
 * code (lib/products, lib/orders, lib/subscriptions, lib/address, lib/cart,
 * lib/scrape/product), operate exclusively on webshop Prisma models
 * (orders/products/discounts), or present products (ui). lib/tools/
 * registry.ts composes ALL_TOOLS through these names at their ORIGINAL
 * spread positions, so the shipped tool list and manifest stay
 * byte-identical.
 *
 * The static variant (commerce.static.ts) exports the same names as empty
 * packs — a managed-site materialization (mcp without webshop) swaps it in
 * and loses exactly the commerce tools, nothing else.
 */
export { productsTools } from "@/lib/tools/products";
export { ordersTools } from "@/lib/tools/orders";
export { discountsTools } from "@/lib/tools/discounts";
export { categoriesTools } from "@/lib/tools/categories";
export { customerTools } from "@/lib/tools/customer";
export { addressTools } from "@/lib/tools/address";
export { subscriptionsTools } from "@/lib/tools/subscriptions";
// Single-tool packs that are commerce-only in substance (codex review
// fold-in, PR #384): analytics.summary aggregates orders/products,
// marketing.create_campaign creates discount codes, ui.present_products
// renders product cards, scraper.scrape_url extracts product data for
// products.create.
export { analyticsTools } from "@/lib/tools/analytics";
export { marketingTools } from "@/lib/tools/marketing";
export { uiTools } from "@/lib/tools/ui";
export { scraperTools } from "@/lib/tools/scraper";
