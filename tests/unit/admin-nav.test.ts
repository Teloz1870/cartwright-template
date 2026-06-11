import { describe, expect, it } from "vitest";

import {
  NAV_GROUPS,
  filterNav,
  filterPinned,
  isRouteActive,
  type NavContext,
} from "@/lib/admin/nav";

const ALL_FLAGS = {
  subscriptions: true,
  reviews: true,
  visualBuilderEnabled: true,
  mediaLibrary: true,
  hoptify: true,
  adminAgenticDashboard: true,
  sheetsSync: true,
  googleDrive: true,
  docsImport: true,
};

function ctx(overrides: Partial<NavContext> = {}): NavContext {
  return {
    ecommerceEnabled: false,
    features: {},
    isProd: false,
    ...overrides,
  };
}

const groupIds = (c: NavContext) => filterNav(NAV_GROUPS, c).map((g) => g.id);
const itemsOf = (c: NavContext, id: string) =>
  filterNav(NAV_GROUPS, c)
    .find((g) => g.id === id)
    ?.items.map((i) => i.href) ?? [];

describe("filterNav — website mode (Teloz, no flags)", () => {
  const c = ctx({ ecommerceEnabled: false });

  it("dropper hele Salg-gruppen (alle punkter er ecommerce/flag-gated)", () => {
    expect(groupIds(c)).not.toContain("salg");
  });

  it("beholder de anker-bærende grupper", () => {
    expect(groupIds(c)).toEqual([
      "indhold",
      "intelligens",
      "marketing",
      "forbindelser",
      "udseende",
      "system",
    ]);
  });

  it("Indhold skjuler flag-gatede punkter (Visual Builder, Media)", () => {
    expect(itemsOf(c, "indhold")).toEqual([
      "/admin/sider",
      "/admin/blog",
      "/admin/services",
      "/admin/translations",
      "/admin/redirects",
    ]);
  });

  it("Intelligens krymper til de ugatede AI-værktøjer (ingen Hoptify/Agentic)", () => {
    expect(itemsOf(c, "intelligens")).not.toContain("/admin/hoptify");
    expect(itemsOf(c, "intelligens")).not.toContain("/admin/agentic");
    expect(itemsOf(c, "intelligens")[0]).toBe("/admin/ai");
  });

  it("pinner Dashboard + Leads", () => {
    expect(filterPinned(c).map((i) => i.href)).toEqual(["/admin", "/admin/leads"]);
  });
});

describe("filterNav — webshop max-features (alle flags on)", () => {
  const c = ctx({ ecommerceEnabled: true, features: ALL_FLAGS });

  it("viser alle syv grupper", () => {
    expect(groupIds(c)).toEqual([
      "salg",
      "indhold",
      "intelligens",
      "marketing",
      "forbindelser",
      "udseende",
      "system",
    ]);
  });

  it("Salg har alle ni punkter med Ordrer + Produkter først", () => {
    const salg = itemsOf(c, "salg");
    expect(salg).toHaveLength(9);
    expect(salg.slice(0, 2)).toEqual(["/admin/ordrer", "/admin/produkter"]);
  });

  it("Forbindelser er kun Integrationer + API-keys (Google-connectors foldet ind i Integrationer)", () => {
    expect(itemsOf(c, "forbindelser")).toEqual([
      "/admin/integrations",
      "/admin/api-keys",
    ]);
    for (const folded of ["/admin/sheets", "/admin/drive", "/admin/docs-import"]) {
      expect(itemsOf(c, "forbindelser")).not.toContain(folded);
    }
  });

  it("Udseende er kun Indstillinger (Designs foldet ind som tab)", () => {
    expect(itemsOf(c, "udseende")).toEqual(["/admin/indstillinger"]);
    expect(itemsOf(c, "udseende")).not.toContain("/admin/designs");
  });
});

describe("filterNav — dev-only gating", () => {
  it("skjuler Mails (devOnly) i production", () => {
    const prod = ctx({ isProd: true });
    expect(itemsOf(prod, "marketing")).not.toContain("/admin/mails");
  });

  it("viser Mails uden for production", () => {
    const dev = ctx({ isProd: false });
    expect(itemsOf(dev, "marketing")).toContain("/admin/mails");
  });
});

describe("filterNav — agent-marketplace promotion", () => {
  it("promoverer Agentic A2A til toppen af Intelligens", () => {
    const c = ctx({
      mode: "agent-marketplace",
      features: { adminAgenticDashboard: true },
    });
    expect(itemsOf(c, "intelligens")[0]).toBe("/admin/agentic");
  });

  it("rører ikke rækkefølgen i andre modes", () => {
    const c = ctx({ features: { adminAgenticDashboard: true } });
    expect(itemsOf(c, "intelligens")[0]).toBe("/admin/ai");
  });
});

describe("isRouteActive", () => {
  it("Dashboard matcher kun exact", () => {
    expect(isRouteActive("/admin", "/admin")).toBe(true);
    expect(isRouteActive("/admin/produkter", "/admin")).toBe(false);
  });

  it("andre ruter matcher exact + sub-routes", () => {
    expect(isRouteActive("/admin/produkter", "/admin/produkter")).toBe(true);
    expect(isRouteActive("/admin/produkter/123", "/admin/produkter")).toBe(true);
    expect(isRouteActive("/admin/produkter-arkiv", "/admin/produkter")).toBe(false);
  });

  it("håndterer null pathname", () => {
    expect(isRouteActive(null, "/admin")).toBe(false);
  });
});
