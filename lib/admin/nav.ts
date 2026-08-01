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
 * Admin-sidebar informationsarkitektur (single source of truth).
 *
 * Menuen var tidligere en flad liste på ~40 punkter direkte i
 * app/admin/layout.tsx. Den er nu grupperet efter én varig placerings-regel
 * (se internal-docs / planen): hvert punkt hører til præcis ét område, og
 * fremtidige features slottes via reglen "hvad er featurens *produkt*?".
 *
 * Gating: et punkt vises kun hvis det består sin gate (ecommerce / feature-flag
 * / dev-only). En gruppe skjules helt når den ender uden synlige punkter — så
 * fx website-mode (Teloz, ecommerceEnabled=false) får hele "Salg" til at
 * forsvinde uden tomme accordions. Se filterNav().
 */

export type NavItem = {
  href: string;
  label: string;
  /** Kræver brand.ecommerceEnabled (skjules i website-mode). */
  ecommerce?: boolean;
  /** Kræver at ALLE disse brand.features.*-nøgler er truthy. */
  flags?: string[];
  /** Kun synlig uden for production (dev-only værktøj, fx Mails-previews). */
  devOnly?: boolean;
};

export type NavGroup = {
  /** Stabil slug — bruges til localStorage-nøgle + React-key. */
  id: string;
  title: string;
  icon: LucideIcon;
  /** Foldet som udgangspunkt (åbnes automatisk hvis den rummer den aktive rute). */
  collapsedByDefault: boolean;
  items: NavItem[];
};

export type NavContext = {
  ecommerceEnabled: boolean;
  features: Record<string, boolean | undefined>;
  isProd: boolean;
  /** brand.mode — bruges til mode-specifik promotion (agent-marketplace). */
  mode?: string;
};

/** Fast top — altid synlig over grupperne. De to punkter findes i alle modes. */
export const PINNED: NavItem[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/leads", label: "Leads" },
];

/** Ikon pr. pinned rute (pinned punkter får ikon, gruppe-punkter gør ikke). */
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
      // Google Sheets / Drive / Docs-import er foldet ind i /admin/integrations
      // som "Import & sync"-connector-kort (Shopify "Apps"-mønster).
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
      // Designs er foldet ind i /admin/indstillinger som "Designs"-tab.
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
 * Aktiv-rute-logik — delt mellem AdminNavLink (highlight) og AdminNav
 * (auto-expand af den gruppe der rummer den aktive side).
 *
 * Exact match, ELLER pathname starter med href (gælder sub-routes som
 * /admin/produkter/[id]). Dashboard ("/admin") matcher kun exact, så den ikke
 * lyser på alle /admin/*-sider.
 */
export function isRouteActive(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
}

/** Består punktet sin gate i den givne kontekst? */
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

/** De synlige pinned-punkter i den givne kontekst. */
export function filterPinned(ctx: NavContext): NavItem[] {
  return PINNED.filter((item) => itemVisible(item, ctx));
}

/**
 * Filtrér grupperne: drop punkter der fejler deres gate, drop derefter grupper
 * der ender tomme (ingen tomme accordions). I agent-marketplace-mode promoveres
 * "Agentic A2A" til toppen af Intelligens-gruppen.
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
