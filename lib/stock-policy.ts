/**
 * How a product's stock is kept (`Product.stockPolicy`, BOM2a contract §6.5 "Lager: STOCK1").
 * One definition, for the importer that plans it today and for checkout once STOCK1 reads it:
 *
 * - `tracked`     — counted, sold only while in stock (the engine's rule today, and the default).
 * - `backorder`   — counted, and sold past zero.
 * - `untracked`   — not counted, always sold.
 * - `unavailable` — not counted, never sold.
 *
 * Nothing reads it in checkout yet: until STOCK1, the cart sells only what is in stock.
 */
export type StockPolicy = "tracked" | "backorder" | "untracked" | "unavailable";
