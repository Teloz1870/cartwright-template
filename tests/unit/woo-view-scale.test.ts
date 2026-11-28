import { describe, expect, it } from "vitest";

import { WooView, type ViewRow } from "@/lib/woo/view";

/**
 * W21-live-2a-4 R2 (Codex P2): a category chunk's view records every permalink-holding
 * product under the same empty-slug key. Copying that key's rows on each add made the
 * read quadratic (150,000 holders ≈ 22 s, over the chunk's 20 s transaction). The view
 * now appends to the key's list in place. Asserted on the list itself, not on a clock:
 * a timing bound flakes under a loaded test run.
 */
const holder = (i: number): ViewRow => ({ id: `p${i}`, source: null, externalId: null, slug: "", permalink: `/p/${i}/`, kind: "product" });
const shared = (view: WooView) => (view as unknown as { held: Map<string, ViewRow[]> }).held.get("product:slug:");

describe("WooView at catalogue scale", () => {
  it("appends a holder to a shared key's list in place instead of copying the list", () => {
    const view = new WooView({ categories: [], products: [] });
    view.record(undefined, holder(0));
    const list = shared(view);
    for (let i = 1; i < 20_000; i++) view.record(undefined, holder(i));
    expect(shared(view)).toBe(list);
    expect(list).toHaveLength(20_000);
  });

  it("still finds each holder by permalink and by the shared key", () => {
    const view = new WooView({ categories: [], products: [] });
    for (let i = 0; i < 20_000; i++) view.record(undefined, holder(i));
    expect(view.holder("category", { slug: "x", permalink: "/p/19999/" })?.by.id).toBe("p19999");
    expect(view.holder("product", { slug: "", permalink: null }, "p0")?.by.id).toBe("p1");
  });
});
