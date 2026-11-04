/**
 * STOREFRONT-DRAFT-FILTER: the products the public catalogue holds — not
 * soft-deleted (`deletedAt`, the trash `audit.revert` restores from) and not a
 * draft (`status`, GAP6: "active" | "draft"). Every storefront and public
 * product reader spreads this into its `where`, so a draft is not listed,
 * counted, searched or given a page: its PDP answers 404, as a deleted one
 * does. Admin reads keep `{ deletedAt: null }`, so the owner still sees a
 * draft.
 *
 * Its own file with no imports, so every module that reads products — the
 * shell's sitemap and homepage, the permalink map, plugins, the tool packs —
 * can import it without reaching into the webshop module.
 */
export const LIVE_PRODUCT_WHERE = { status: "active", deletedAt: null } as const;

/** Callers that act for the shop owner: the admin UI (`user:`), the admin
 *  chat, the in-place editor, and an API key — keys are minted only in
 *  /admin/api-keys. */
const OWNER_ACTOR = /^(user|operator-chat|annotation|apikey):/;

/**
 * The product filter a tool call reads under. The owner's own callers see a
 * draft; everyone else — shopper chat and voice, anonymous agents over REST
 * and MCP, a background job, an actor this list does not know — gets the
 * public catalogue.
 */
export function productWhereFor(actor: string) {
  return OWNER_ACTOR.test(actor) ? { deletedAt: null } : LIVE_PRODUCT_WHERE;
}
