import {
  LayoutDashboard,
  Inbox,
  ShoppingCart,
  FileText,
  Sparkles,
  Megaphone,
  Plug,
  Palette,
  Settings,
  type LucideIcon,
} from "lucide-react";

/**
 * Admin sidebar information architecture (single source of truth).
 *
 * The menu used to be a flat ~40-item list directly in
 * app/admin/layout.tsx. It is now grouped by one durable placement rule
 * (see internal-docs / the plan): every item belongs to exactly one area, and
 * future features slot in via the rule "what is this feature's *product*?".
 *
 * Gating: an item is shown only if it passes its gate (ecommerce / feature flag
 * / dev-only). A group is hidden entirely once it has no visible items left — so
 * e.g. website mode (Teloz, ecommerceEnabled=false) makes the whole "Sales"
 * group disappear instead of leaving empty accordions. See filterNav().
 */

export type NavItem = {
  href: string;
  label: string;
  /** Requires brand.ecommerceEnabled (hidden in website mode). */
  ecommerce?: boolean;
  /** Requires ALL of these brand.features.* keys to be truthy. */
  flags?: string[];
  /** Only visible outside production (dev-only tooling, e.g. Mail previews). */
  devOnly?: boolean;
};

export type NavGroup = {
  /** Stable slug — used for the localStorage key + React key. */
  id: string;
  title: string;
  icon: LucideIcon;
  /** Collapsed by default (opens automatically when it contains the active route). */
  collapsedByDefault: boolean;
  items: NavItem[];
};

export type NavContext = {
  ecommerceEnabled: boolean;
  features: Record<string, boolean | undefined>;
  isProd: boolean;
  /** brand.mode — used for mode-specific promotion (agent marketplace). */
  mode?: string;
};

/** Fixed top — always visible above the groups. Both items exist in every mode. */
export const PINNED: NavItem[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/leads", label: "Leads" },
];

/** Icon per pinned route (pinned items get an icon, group items do not). */
export const PINNED_ICONS: Record<string, LucideIcon> = {
  "/admin": LayoutDashboard,
  "/admin/leads": Inbox,
};

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "salg",
    title: "Sales",
    icon: ShoppingCart,
    collapsedByDefault: false,
    items: [
      { href: "/admin/ordrer", label: "Orders", ecommerce: true },
      { href: "/admin/produkter", label: "Products", ecommerce: true },
      { href: "/admin/kategorier", label: "Categories", ecommerce: true },
      { href: "/admin/kunder", label: "Customers", ecommerce: true },
      {
        href: "/admin/subscriptions",
        label: "Subscriptions",
        ecommerce: true,
        flags: ["subscriptions"],
      },
      { href: "/admin/rabatkoder", label: "Discount codes", ecommerce: true },
      { href: "/admin/anmeldelser", label: "Reviews", flags: ["reviews"] },
      { href: "/admin/shipping", label: "Shipping zones", ecommerce: true },
      { href: "/admin/leverandorer", label: "Suppliers", ecommerce: true },
    ],
  },
  {
    id: "indhold",
    title: "Content",
    icon: FileText,
    collapsedByDefault: false,
    items: [
      { href: "/admin/sider", label: "Pages" },
      { href: "/admin/blog", label: "Blog" },
      { href: "/admin/services", label: "Services" },
      {
        href: "/admin/visual-builder",
        label: "Visual Builder",
        flags: ["visualBuilderEnabled"],
      },
      { href: "/admin/media", label: "Media", flags: ["mediaLibrary"] },
      { href: "/admin/translations", label: "Translations" },
      { href: "/admin/redirects", label: "Redirects" },
    ],
  },
  {
    id: "intelligens",
    title: "Intelligence",
    icon: Sparkles,
    collapsedByDefault: false,
    items: [
      { href: "/admin/ai", label: "AI copilot" },
      { href: "/admin/genome", label: "Genome", flags: ["genomeResolve"] },
      { href: "/admin/verticals", label: "Verticals (Voice)", flags: ["verticalPresets"] },
      { href: "/admin/mixer", label: "Page Mixer", flags: ["mixerPreviewEnabled"] },
      { href: "/admin/seo-performance", label: "SEO/GEO Autopilot", flags: ["seoAutopilot", "cartwrightPlus"] },
      { href: "/admin/vibe-sandbox", label: "Vibe Sandbox" },
      { href: "/admin/design-import", label: "Design import", flags: ["designImport"] },
      { href: "/admin/three-d", label: "Live Canvas (3D)", flags: ["threeD"] },
      { href: "/admin/hoptify", label: "Hop off Shopify 🐸", flags: ["hoptify"] },
      {
        href: "/admin/agentic",
        label: "Agentic A2A",
        flags: ["adminAgenticDashboard"],
      },
    ],
  },
  {
    id: "marketing",
    title: "Marketing & contact",
    icon: Megaphone,
    collapsedByDefault: true,
    items: [
      { href: "/admin/newsletter", label: "Newsletter" },
      { href: "/admin/telefon", label: "Telephony" },
      { href: "/admin/mails", label: "Mail previews", devOnly: true },
    ],
  },
  {
    id: "forbindelser",
    title: "Connections",
    icon: Plug,
    collapsedByDefault: true,
    items: [
      // Google Sheets / Drive / Docs import are folded into /admin/integrations
      // as "Import & sync" connector cards (the Shopify "Apps" pattern).
      { href: "/admin/integrations", label: "Integrations" },
      { href: "/admin/api-keys", label: "API keys" },
    ],
  },
  {
    id: "udseende",
    title: "Appearance",
    icon: Palette,
    collapsedByDefault: true,
    items: [
      // Designs is folded into /admin/indstillinger as the "Designs" tab.
      { href: "/admin/indstillinger", label: "Settings" },
    ],
  },
  {
    id: "system",
    title: "System & setup",
    icon: Settings,
    collapsedByDefault: true,
    items: [
      { href: "/admin/features", label: "Features" },
      // Always visible (no flag): this page IS the activation path for Plus,
      // so it must be reachable before the cartwrightPlus flag is on.
      { href: "/admin/plus", label: "Cartwright Plus" },
      { href: "/admin/sitepacks", label: "Snapshot & Restore", flags: ["sitePack"] },
      {
        href: "/admin/registry-stats",
        label: "Registry stats",
        flags: ["registryStats"],
      },
      { href: "/admin/seo", label: "SEO & indexing" },
      { href: "/admin/processors", label: "Processors" },
      { href: "/admin/audit", label: "Audit log" },
      { href: "/admin/hosting", label: "Hosting" },
    ],
  },
];

/**
 * Active-route logic — shared between AdminNavLink (highlight) and AdminNav
 * (auto-expanding the group that contains the active page).
 *
 * Exact match, OR pathname starts with href (covers sub-routes such as
 * /admin/produkter/[id]). Dashboard ("/admin") matches only exactly, so it does
 * not light up on every /admin/* page.
 */
export function isRouteActive(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
}

/** Does the item pass its gate in the given context? */
export function itemVisible(item: NavItem, ctx: NavContext): boolean {
  if (item.ecommerce && !ctx.ecommerceEnabled) return false;
  if (item.devOnly && ctx.isProd) return false;
  if (item.flags) {
    for (const flag of item.flags) {
      if (!ctx.features[flag]) return false;
    }
  }
  return true;
}

/** The visible pinned items in the given context. */
export function filterPinned(ctx: NavContext): NavItem[] {
  return PINNED.filter((item) => itemVisible(item, ctx));
}

/**
 * Filter the groups: drop items that fail their gate, then drop groups that end
 * up empty (no empty accordions). In agent-marketplace mode, "Agentic A2A" is
 * promoted to the top of the Intelligence group.
 */
export function filterNav(groups: NavGroup[], ctx: NavContext): NavGroup[] {
  const out: NavGroup[] = [];
  for (const group of groups) {
    let items = group.items.filter((item) => itemVisible(item, ctx));
    if (items.length === 0) continue;

    if (group.id === "intelligens" && ctx.mode === "agent-marketplace") {
      const agentic = items.filter((it) => it.href === "/admin/agentic");
      if (agentic.length > 0) {
        items = [...agentic, ...items.filter((it) => it.href !== "/admin/agentic")];
      }
    }

    out.push({ ...group, items });
  }
  return out;
}
