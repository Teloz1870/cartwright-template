/**
 * The module catalogue — cartwright-module-v1 nodes + the four profile
 * definitions (owner-approved 2026-07-15: site ⊂ managed-site ⊂ commerce ⊂
 * agentic, additive always).
 *
 * Fase-1/2 scope (THIS file's honesty contract):
 *  - The GRAPH is real: slugs, kinds, dependsOn edges and the profile sets
 *    are the decided architecture, validated by tests/unit/modules.test.ts.
 *  - The 9 shipped plugins are wrapped 1:1 from plugins/registry.ts —
 *    their files/flags/mounts are already true on disk.
 *  - B2 (this slice): non-plugin modules carry DIRECTORY-SCOPED file
 *    inventories — every entry is an existing directory root or key file
 *    (no file moves, nothing at engine runtime reads this registry yet;
 *    the CLI materializer consumes it in Fase 3/B3). Inventory rules:
 *      · a path is claimed by exactly ONE non-plugin module, and no claimed
 *        path lives inside another non-plugin module's claimed directory
 *        (tests enforce both);
 *      · plugin-owned files (plugins/registry.ts) are never re-claimed here —
 *        plugin route mounts intentionally live INSIDE module-claimed dirs
 *        (e.g. app/admin/blog under admin's monolith claim); the plugin
 *        system, not the module union, prunes/re-creates those mounts;
 *      · where the decided boundary and the code on disk still disagree,
 *        the module says so in `knownDeviations` instead of pretending.
 *  - PRISMA FRAGMENTS are DOCUMENTATION in B2: each `prismaFragment` below is
 *    a comment-style text block listing the models that module exclusively
 *    owns in prisma/schema.prisma. Physical schema assembly (base + included
 *    fragments → schema.prisma) is the B3 materializer's job. Shared models
 *    (User relations, BrandingSettings, IntegrationSettings, …) stay in the
 *    db/base fragment.
 *  - SEAMS (B1, landed): core declares the two data-source seam targets
 *    (`lib/data-source/brand.ts` + `lib/data-source/nav.ts`). On disk each
 *    target contains the DB variant (main IS a db-included tree — byte-
 *    identical), owned + `replaces`-provided by the db module; core owns the
 *    `.static.ts` variants alongside. A no-db materialization (B3) satisfies
 *    each unreplaced seam by copying its `<seam>.static.ts` over the target.
 *
 * CLIENT-SAFE: pure data — same pattern as plugins/registry.ts.
 */
import {
  MODULE_SCHEMA_ID,
  resolveModuleSet,
  type CartwrightModuleManifest,
  type ProfileDefinition,
} from "@/lib/modules/spec";
import { PLUGINS } from "@/plugins/registry";
import type { CartwrightPluginManifest } from "@/lib/plugins/spec";

// ── Plugin wrapping (1:1, semantics unchanged) ──────────────────────────────

/**
 * Module-view extras for wrapped plugins (B3). These do NOT touch the live
 * plugin manifests — plugin install/uninstall semantics stay exactly as
 * shipped. They exist only for the materializer's file math:
 *
 *  - `files`: engine files that belong with the plugin at MATERIALIZATION
 *    time but are deliberately absent from the plugin manifest (deleting
 *    them on runtime uninstall would break shared callers — e.g. the db
 *    homepage imports lib/three/resolve.ts).
 *  - `replaces`: seam targets the plugin provides (core declares the seams
 *    and owns the `.static` variants; a profile without the plugin gets the
 *    static copy).
 */
const PLUGIN_MODULE_EXTRAS: Record<
  string,
  {
    files?: string[];
    replaces?: { target: string; with: string }[];
    /**
     * B4: npm deps the plugin's code imports but its LIVE manifest doesn't
     * declare (declaring them there would change install semantics — the
     * installer adds manifest deps to a customer's package.json). Module-view
     * only, for prune math.
     */
    deps?: { name: string }[];
  }
> = {
  "design-import": { deps: [{ name: "ai" }] },
  "logo-generator": { deps: [{ name: "ai" }] },
  "three-scenes": {
    files: [
      "lib/three/resolve.ts",
      "lib/three/apply.ts",
      "lib/three/types.ts",
      // The one design pack that imports the three.js runtime directly (its
      // own HeroCanvas, not the ThreeHero seam) — it travels with the plugin
      // so a profile without three-scenes can prune the `three` dependency.
      "designs/engineered",
    ],
    replaces: [
      { target: "components/ThreeHero.tsx", with: "components/ThreeHero.tsx" },
      { target: "components/DesignHero.tsx", with: "components/DesignHero.tsx" },
      { target: "lib/three/resolve.ts", with: "lib/three/resolve.ts" },
    ],
  },
};

/**
 * Every shipped plugin needs the database + the admin surface (their admin
 * dashboards, Prisma fragments and audit trails assume both) — so in profile
 * terms plugins become available from `managed-site` upward.
 */
function wrapPlugin(p: CartwrightPluginManifest): CartwrightModuleManifest {
  const extras = PLUGIN_MODULE_EXTRAS[p.slug];
  return {
    schema: MODULE_SCHEMA_ID,
    slug: p.slug,
    name: p.name,
    description: p.description,
    version: p.version,
    kind: "plugin",
    dependsOn: ["db", "admin"],
    files: [...p.files, ...(extras?.files ?? []).map((path) => ({ path }))],
    // Module view routes ambient @types/* to devDeps (they live in
    // devDependencies); the live plugin manifest stays untouched.
    deps: [...(p.deps ?? []), ...(extras?.deps ?? [])].filter(
      (d) => !d.name.startsWith("@types/"),
    ),
    devDeps: (p.deps ?? []).filter((d) => d.name.startsWith("@types/")),
    env: [],
    prismaFragment: p.prismaFragment,
    routeMounts: p.routeMounts,
    adminNav: p.adminNav,
    seams: [],
    replaces: extras?.replaces ?? [],
    tests: [],
    docs: [],
    flag: p.flag,
  };
}

// ── Module nodes (B2: directory-scoped inventories) ─────────────────────────

/** Directory-scoped inventory entry list: one entry per directory root or key file. */
function inv(...paths: string[]): CartwrightModuleManifest["files"] {
  return paths.map((path) => ({ path }));
}

function node(
  slug: string,
  name: string,
  description: string,
  dependsOn: string[],
  kind: CartwrightModuleManifest["kind"] = "module",
  extra: Partial<CartwrightModuleManifest> = {},
): CartwrightModuleManifest {
  return {
    schema: MODULE_SCHEMA_ID,
    slug,
    name,
    description,
    version: "0.1.0",
    kind,
    dependsOn,
    files: [],
    deps: [],
    devDeps: [],
    env: [],
    seams: [],
    replaces: [],
    tests: [],
    docs: [],
    ...extra,
  };
}

/**
 * B3 note — the seam model at full strength (extends the B1 convention):
 *
 *  - The PROVIDER module owns the seam TARGET file (its on-disk content IS
 *    the provider's variant — main is a db-included tree, byte-identical),
 *    and lists `replaces: { target, with: target }` to say "when I'm in the
 *    profile, the on-disk content stands".
 *  - The DECLARING module (core, or contact-form for its endpoint) lists the
 *    seam path in `seams` and owns the sibling `<name>.static.<ext>` variant.
 *  - The materializer's rule, in order: delete every excluded module's
 *    files → for each declared seam with NO included provider, copy the
 *    static sibling over the target (recreating it) and drop the sibling.
 *
 * Registry-codemod targets (NOT seams): designs/index.ts, designs/options.ts,
 * plugins/registry.ts and components/svg-items/design-motifs.ts statically
 * import every design pack / plugin manifest. The CLI already ships proven
 * codemods that rewrite these files entry-by-entry (profile-light.ts /
 * design-install.ts); the materializer runs the same codemods for every
 * excluded design/plugin instead of using seam variants (a static variant
 * would drift on every added design).
 */
const core = node(
  "core",
  "Core",
  "App shell, i18n routing, design system + website-safe packs, sections, SEO/JSON-LD, llms.txt. Present in every profile.",
  [],
  "core",
  {
    files: inv(
      "components/HeaderClient.tsx",
      "components/chrome-parts",
      // Shared design-system spine (packs listed individually so the
      // webshop-coupled packs can live under the webshop module without
      // nested-claim conflicts).
      "designs/types.ts",
      "designs/index.ts",
      "designs/options.ts",
      "designs/layout-types.ts",
      "designs/chrome-slugs.ts",
      "designs/tokens.ts",
      // Website-safe design packs (mode "website"/"both" with no webshop
      // imports — audited 2026-07-15). Webshop-coupled packs are claimed by
      // the webshop module below.
      "designs/aerospace",
      "designs/aurora-site",
      "designs/blank",
      "designs/brutalist",
      "designs/corporate-baseline",
      "designs/drive",
      "designs/editorial-ink",
      "designs/fable",
      "designs/flux",
      "designs/jungle",
      "designs/meridian",
      "designs/nocturne",
      "designs/saas-dark",
      "designs/stack",
      "designs/stillwater",
      "designs/studio",
      "lib/theme.ts",
      // Genome READ path (render-side, flag-gated). The store is a seam:
      // db owns lib/genome/store.ts; core owns the static (anchors-only)
      // variant. The WRITE/resolution side lives under admin.
      "lib/genome/read.ts",
      "lib/genome/list.ts",
      "lib/genome/fields.ts",
      "lib/genome/types.ts",
      "lib/genome/THESIS.md",
      // Builder render/catalog layer (the AI section-GENERATOR is admin's).
      "lib/builder/chrome-catalog.ts",
      "lib/builder/chrome-registry.tsx",
      "lib/builder/effects.ts",
      "lib/builder/elements-catalog.ts",
      "lib/builder/page-layout.ts",
      "lib/builder/section-jsonld.ts",
      "lib/builder/section-registry.tsx",
      "lib/builder/section-schema.ts",
      // Pure HTML sanitizer the section renderer uses on vibe sections; the
      // rest of the v0 bridge (client + transforms) is admin's.
      "lib/v0/transform/sanitize.ts",
      "lib/content.ts", // pure ContentBlock parsing/rendering (no DB)
      "lib/contact-mail.ts", // dependency-free owner-mail (site contact/lead surfaces)
      "i18n",
      "messages",
      "brand.config.ts",
      "app/manifest.ts", // PWA web-app manifest
      "app/og",
      "lib/brand.ts",
      // Flag manifest + read path; the WRITE path (apply.ts) is admin's.
      "lib/feature-flags/manifest.ts",
      "lib/feature-flags/status.ts",
      "lib/feature-flags/context.tsx",
      "lib/feature-flags/resolve.ts",
      "lib/format.ts",
      "lib/three/scene-ids.ts", // dependency-free SceneId union (design contract)
      // In-place-edit ATTRIBUTE helper is core (design packs attach
      // data-cw-edit markers); the edit machinery itself is admin's.
      "components/annotate/editAttr.ts",
      "lib/annotate/types.ts",
      // B1+B3 static seam variants — core owns every `<seam>.static.<ext>`:
      "lib/data-source/brand.static.ts",
      "lib/data-source/nav.static.ts",
      "app/[locale]/layout.static.tsx",
      "app/[locale]/page.static.tsx",
      "components/Header.static.tsx",
      "components/Footer.static.tsx",
      "app/sitemap.static.ts",
      "app/llms.txt/route.static.ts",
      "proxy.static.ts",
      "lib/genome/store.static.ts",
      "lib/layout.static.ts",
      "components/ThreeHero.static.tsx",
      "components/DesignHero.static.tsx",
      "lib/three/resolve.static.ts",
      "app/actions/lead.static.ts",
      "app/[locale]/info/[slug]/page.static.tsx",
      "lib/seo-settings.static.ts",
      "lib/genome/resolvers/copy-field.static.ts",
    ),
    // Seam targets (replaceable per profile). Providers: db for everything
    // DB-coupled, auth for the middleware, pages-db for the info page,
    // three-scenes for the 3D layer, contact-form declares its own endpoint
    // seam below.
    seams: [
      "lib/data-source/brand.ts",
      "lib/data-source/nav.ts",
      "app/[locale]/layout.tsx",
      "app/[locale]/page.tsx",
      "components/Header.tsx",
      "components/Footer.tsx",
      "app/sitemap.ts",
      "app/llms.txt/route.ts",
      "proxy.ts",
      "lib/genome/store.ts",
      "lib/layout.ts",
      "components/ThreeHero.tsx",
      "components/DesignHero.tsx",
      "lib/three/resolve.ts",
      "app/actions/lead.ts",
      "app/[locale]/info/[slug]/page.tsx",
      "lib/seo-settings.ts",
      "lib/genome/resolvers/copy-field.ts",
    ],
    knownDeviations: [
      // B3 status: the B1/B3 seams + static variants make the site profile's
      // file set import-closed (proven by tests/unit/site-profile-imports
      // + scripts/site-profile-audit.ts). What remains is B4 work:
      "the on-disk (db) variants of app/[locale]/layout.tsx, page.tsx and components/Header/Footer.tsx import webshop/voice/mcp/admin/plugin surfaces beyond their recorded provider (db) — every db-including profile today also includes those modules or ships their files, but a managed-site MATERIALIZATION (no webshop/voice) needs component-level gates or thinner db variants (B4)",
      "unclaimed files ship in every profile by design (claims are exclusion lists) — the B4 CI materialization proves per-profile compile/boot; the audit script's whitelist zones (tests/, docs/, scripts/, e2e/) ship only what included modules claim via tests/docs",
    ],
  },
);

const MODULE_NODES: CartwrightModuleManifest[] = [
  core,
  node("contact-form", "Contact form", "Serverless contact form via Resend — no database (owner decision 2026-07-15: site-profile opt-in via --with contact-form; included by default from managed-site upward).", [], "module", {
    // The contact page + its endpoints. The inquiries endpoint is a SEAM:
    // on-disk (db-owned) it writes a Lead row + AI triage; the static
    // variant mails the owner via lib/contact-mail (Resend REST, no SDK).
    // app/api/contact/upload (attachments → Vercel Blob) is db's: the
    // attachment flow only exists with the full stack (contactAttachments
    // flag + Lead rows); the Resend-only form never uploads.
    files: inv("app/[locale]/contact", "app/api/inquiries/route.static.ts"),
    seams: ["app/api/inquiries/route.ts"],
    env: [
      {
        name: "RESEND_API_KEY",
        required: false,
        docs: "Without it, contact/lead mails land in .mail-previews/ (dev preview).",
      },
      {
        name: "RESEND_FROM",
        required: false,
        example: "hello@yourdomain.com",
        docs: "Verified sender address — the onboarding@resend.dev fallback only delivers to the Resend account owner.",
      },
    ],
  }),
  node("db", "Database", "Prisma + libSQL/Turso/Postgres data layer; the db seam variants replace core's static content sources AND provide the DB-coupled variants of the app shell (layout/homepage/chrome/sitemap/llms).", [], "module", {
    files: inv(
      "lib/db.ts",
      "prisma",
      // Prisma CLI config at the repo root — db-coupled (the site
      // materializer deletes it; B4 made the ownership explicit).
      "prisma.config.ts",
      // Seam targets owned by db (their on-disk content is the DB variant —
      // the shipped engine stays byte-identical without any materializer):
      // B1 data sources…
      "lib/data-source/brand.ts",
      "lib/data-source/nav.ts",
      // …and the B3 app-shell/chrome/content targets.
      "app/[locale]/layout.tsx",
      "app/[locale]/page.tsx",
      "components/Header.tsx",
      "components/Footer.tsx",
      "app/sitemap.ts",
      "app/llms.txt/route.ts",
      "lib/genome/store.ts",
      "lib/layout.ts",
      "app/actions/lead.ts",
      "app/api/inquiries/route.ts",
      // Shared mailer stack: reads its Resend key from IntegrationSettings
      // and carries the auth/webshop mail templates — DB-coupled by nature.
      // The site profile's contact surfaces use core's lib/contact-mail.ts.
      "lib/mailer.ts",
      "lib/mailer/resend.ts",
      // DB-backed announcement bar (BrandingSettings.announcement).
      "components/AnnouncementBar.tsx",
      // Contact-attachment upload (Vercel Blob) — see contact-form's note.
      "app/api/contact",
      // DB-backed SEO indexing controls (root layout + robots read them).
      "lib/seo-settings.ts",
      // Logical DB backups (libSQL dump + cron).
      "lib/backup",
      "app/api/cron/backup",
    ),
    // `with` === `target` is deliberate: including db means "the seam target
    // keeps its on-disk (db) content". Only a no-db materialization rewrites
    // the targets (from the core-owned `.static.*` variants).
    replaces: [
      { target: "lib/data-source/brand.ts", with: "lib/data-source/brand.ts" },
      { target: "lib/data-source/nav.ts", with: "lib/data-source/nav.ts" },
      { target: "app/[locale]/layout.tsx", with: "app/[locale]/layout.tsx" },
      { target: "app/[locale]/page.tsx", with: "app/[locale]/page.tsx" },
      { target: "components/Header.tsx", with: "components/Header.tsx" },
      { target: "components/Footer.tsx", with: "components/Footer.tsx" },
      { target: "app/sitemap.ts", with: "app/sitemap.ts" },
      { target: "app/llms.txt/route.ts", with: "app/llms.txt/route.ts" },
      { target: "lib/genome/store.ts", with: "lib/genome/store.ts" },
      { target: "lib/layout.ts", with: "lib/layout.ts" },
      { target: "app/actions/lead.ts", with: "app/actions/lead.ts" },
      { target: "app/api/inquiries/route.ts", with: "app/api/inquiries/route.ts" },
      { target: "lib/seo-settings.ts", with: "lib/seo-settings.ts" },
    ],
    knownDeviations: [
      "the db-owned app-shell variants (layout/page/Header/Footer) also import webshop/voice/mcp/admin/plugin surfaces — see core.knownDeviations; thinning them per-module is B4",
    ],
    // B4 inventory (import-grounded by tests/unit/modules.test.ts). `prisma`
    // is the generator CLI (owns prisma/); `@prisma/client` is the generated
    // client's runtime — both grounded via exemption, everything else via a
    // bare import inside this module's files.
    deps: [
      { name: "@libsql/client" },
      { name: "@prisma/adapter-libsql" },
      { name: "@prisma/adapter-pg" },
      { name: "@prisma/client" },
      { name: "@vercel/blob" },
      { name: "ai" },
      { name: "bcryptjs" },
      { name: "dotenv" },
      { name: "resend" },
    ],
    devDeps: [{ name: "prisma" }],
    prismaFragment: [
      "// db/base fragment (documentation in B2 — B3 assembles the physical schema).",
      "// Base/shared models that stay in every db-including profile:",
      "//   BrandingSettings, IntegrationSettings, Redirect, RegistryHit",
      "// NOTE: MigrationJob is NOT base — the hoptify plugin's fragment defines",
      "// and owns `model MigrationJob` (plugin-exclusive).",
      "// NOTE: SEO models (SeoSnapshot, SeoExperiment, GeoSnapshot) and media models",
      "// (MediaAsset, ProductMedia, ImageSearchCache) are pending ownership assignment.",
    ].join("\n"),
  }),
  node(
    "agent-core",
    "Agent core",
    "The shared agent-auth surface: API keys + scopes (lib/api-auth, lib/scopes) that MCP/ACP/A2A/UCP all authenticate through. The OAuth authorization server is architecturally agent-core too, but its implementation lives in lib/ucp today, so ucp claims those routes in B2 (see knownDeviations).",
    ["db"], // keys live in the database
    "module",
    {
      // v1 inventory is ONLY the key/scope surface. app/oauth + the two
      // oauth .well-known routes are claimed by ucp: every one of those
      // route files imports @/lib/ucp/* (oauth, authorize, gate), so
      // claiming them here would yield unresolved imports in a managed-site
      // materialization that includes agent-core but not ucp.
      files: inv("lib/api-auth.ts", "lib/scopes.ts"),
      knownDeviations: [
        "the OAuth authorization server (app/oauth, app/.well-known/oauth-*) is implemented in lib/ucp and therefore inventoried under ucp in B2 — moving it into agent-core requires extracting the OAuth implementation from lib/ucp in a future split (the OAuthClient/OAuthAuthCode/OAuthToken models move with it)",
      ],
      prismaFragment: [
        "// agent-core fragment (documentation in B2 — B3 assembles the physical schema).",
        "// Reserved models: OAuthClient, OAuthAuthCode, OAuthToken — they travel with",
        "// the OAuth server, which lives under ucp in B2 (see knownDeviations).",
      ].join("\n"),
    },
  ),
  node("auth", "Auth", "Auth.js magic-link + password sign-in. Owns the session-aware middleware variant (proxy.ts).", ["db"], "module", {
    files: inv(
      "lib/auth.ts",
      "lib/auth.config.ts",
      "lib/auth",
      "app/api/auth",
      "app/[locale]/account",
      "app/api/account",
      "components/RegisterForm.tsx",
      "components/LoginForm.tsx",
      "components/LogoutButton.tsx",
      "components/MagicLinkForm.tsx",
      "types/next-auth.d.ts",
      "app/api/cron/cleanup-expired-tokens",
      // Seam target: the on-disk middleware wraps next-intl in NextAuth's
      // session handler (+ Redis rate limits/redirects). The static variant
      // is locale-routing + legacy 301s only.
      "proxy.ts",
    ),
    replaces: [{ target: "proxy.ts", with: "proxy.ts" }],
    deps: [
      { name: "@auth/prisma-adapter" },
      { name: "@upstash/ratelimit" },
      { name: "@upstash/redis" },
      { name: "bcryptjs" },
      { name: "next-auth" },
    ],
    knownDeviations: [
      "app/[locale]/account claims the whole account area, but its orders/subscriptions subpages are webshop-coupled (and the wishlist/review subpages are plugin-mounted inside it) — the account split is a B4 item",
    ],
    prismaFragment: [
      "// auth fragment (documentation in B2 — B3 assembles the physical schema).",
      "// Exclusive models: User, Account, VerificationToken, PasswordResetToken",
      "// (User RELATIONS to webshop/plugin models travel with those fragments.)",
    ].join("\n"),
  }),
  node("admin", "Admin", "The /admin surface (essential set), audit log, AI stack, in-place editing, setup/first-run, SEO/GDPR/import tooling.", ["db", "auth"], "module", {
    // Monolith claim v1: admin owns app/admin + app/api/admin WHOLESALE in B2.
    // Module-specific subpages (agentic dashboard, api-keys, shipping, genome,
    // …) are a B4 split — until then agent-admin & friends stay inventory-empty
    // rather than double-claiming subdirectories.
    files: inv(
      "app/admin",
      "app/api/admin",
      "components/admin",
      "lib/admin",
      "lib/admin.ts",
      "lib/audit.ts",
      // Flag WRITE path (audited apply); the manifest/read side is core's.
      "lib/feature-flags/apply.ts",
      // Genome WRITE/resolution side (admin/AI); the read path is core's.
      "lib/genome/apply.ts",
      "lib/genome/describe.ts",
      "lib/genome/identity.ts",
      "lib/genome/inspect.ts",
      "lib/genome/resolve.ts",
      "lib/genome/resolvers",
      // The AI stack (providers, settings, usage metering, bootstrap) — every
      // consumer surface (admin chat, assistant, annotate, genome resolve,
      // import) requires db+admin.
      "lib/ai",
      "lib/ai-bootstrap.ts",
      // In-place editing machinery (admin-gated); editAttr/types are core's.
      "lib/annotate/server.ts",
      "lib/annotate/targets.ts",
      "lib/annotate/prompt.ts",
      "components/annotate/EditModeOverlay.tsx",
      "components/annotate/EditModeProvider.tsx",
      // Setup wizard + first-run predicates and canvas (DB probes).
      "lib/setup-wizard.ts",
      "lib/setup-status.ts",
      "lib/first-run.ts",
      // First-run canvas (DB predicates). The decorative flora/copy-command
      // pieces stay unclaimed (pure, reused by /built-with-cartwright).
      "components/first-run/WelcomeCanvas.tsx",
      // Admin-managed subsystems that live outside app/admin.
      "lib/compositions",
      "lib/seo",
      "lib/gdpr",
      "lib/redirects",
      "lib/import",
      "lib/sitepack",
      "lib/translations.ts",
      "lib/unsplash.ts",
      "lib/v0/client.ts",
      "lib/v0/transform/extract.ts",
      "lib/v0/transform/sanitize-strict.ts",
      "lib/verticals",
      "lib/designs",
      "lib/magic",
      "lib/scrape",
      "lib/builder/section-generator.ts",
      "components/AIStylistButton.tsx",
      "components/AIStylistPanel.tsx",
      "lib/newsletter.ts",
      "app/api/newsletter",
      "app/api/consent",
      "app/api/look",
      "app/[locale]/builder-preview",
      "app/api/support",
      "app/api/cron/audit-retention",
      "app/api/cron/seo-snapshot",
      "lib/plugins/install.ts",
    ),
    deps: [
      { name: "@ai-sdk/anthropic" },
      { name: "@ai-sdk/google" },
      { name: "@ai-sdk/openai-compatible" },
      { name: "@ai-sdk/react" },
      { name: "@google/genai" },
      { name: "@libsql/client" },
      { name: "@upstash/redis" },
      { name: "@vercel/blob" },
      { name: "ai" },
      { name: "bcryptjs" },
      { name: "date-fns" },
      { name: "dompurify" },
      { name: "js-yaml" },
      { name: "jsdom" },
      { name: "next-auth" },
      { name: "v0-sdk" },
    ],
    // admin provides the genome copy-field resolver at core's seam (the
    // static variant only reads anchors/overrides — resolution needs the AI
    // stack above).
    replaces: [
      {
        target: "lib/genome/resolvers/copy-field.ts",
        with: "lib/genome/resolvers/copy-field.ts",
      },
    ],
    prismaFragment: [
      "// admin fragment (documentation in B2 — B3 assembles the physical schema).",
      "// Exclusive models: ApiKey, AuditLog, DataErasureRequest",
    ].join("\n"),
  }),
  node("pages-db", "DB-backed pages", "Pages/Services content in the database instead of static content files.", ["db", "admin"], "module", {
    // lib/blog.ts is NOT claimed here — the blog plugin owns it (plugins/blog).
    // lib/content.ts moved to core (pure ContentBlock parsing, no DB).
    // app/[locale]/info/[slug]/page.tsx is a seam target inside this claim:
    // the static variant serves the built-in legal pages so footer links
    // never 404 in a site profile.
    files: inv("app/[locale]/info", "app/[locale]/services"),
    replaces: [
      {
        target: "app/[locale]/info/[slug]/page.tsx",
        with: "app/[locale]/info/[slug]/page.tsx",
      },
    ],
    prismaFragment: [
      "// pages-db fragment (documentation in B2 — B3 assembles the physical schema).",
      "// Exclusive models: Page, Service",
    ].join("\n"),
  }),
  node("webshop", "Webshop", "PLP/PDP, cart, Stripe checkout + webhooks, orders, VAT/tax, shipping zones, discounts, multi-currency — plus the webshop-coupled design packs and shared product components.", ["db", "auth", "admin"], "module", {
    files: inv(
      "lib/cart.ts",
      "lib/pricing.ts",
      "lib/tax.ts",
      "lib/discount.ts",
      "lib/stripe.ts",
      "lib/subscriptions.ts",
      "lib/products.ts",
      "lib/products-csv.ts",
      "lib/catalog.ts",
      "lib/shipping",
      "lib/orders",
      "lib/fx",
      "lib/invoicing",
      "lib/address.ts",
      "lib/mailer/abandoned-cart.ts",
      "lib/abandoned-cart.ts",
      "lib/fulfillment.ts",
      "lib/marketing",
      "lib/search",
      "lib/media",
      "app/[locale]/cart",
      "app/[locale]/checkout",
      "app/[locale]/product",
      "app/[locale]/produkter",
      "app/[locale]/category",
      "app/[locale]/order",
      "app/api/checkout",
      "app/api/webhook",
      "app/api/products",
      "app/api/commerce",
      "app/api/fulfillment",
      "app/api/cron/reconcile-stripe",
      "app/api/cron/fx-refresh",
      "app/api/cron/media-ai",
      "app/api/cron/abandoned-cart",
      // Shared product UI (structurally typed via designs/types.DesignProduct).
      "components/ProductGrid.tsx",
      "components/ProductCard.tsx",
      "components/AddToCartButton.tsx",
      "components/CartQuantity.tsx",
      "components/CheckoutForm.tsx",
      "components/Price.tsx",
      "components/TransitionLink.tsx",
      "components/PDPStickyAtcBar.tsx",
      "components/VariantPicker.tsx",
      "components/CatalogFilters.tsx",
      "components/StripePaymentPanel.tsx",
      "components/TrustBadges.tsx",
      "components/shared/PlanCard.tsx",
      "components/payments",
      // Webshop-coupled design packs (mode "webshop", or "both" with webshop
      // imports — audited 2026-07-15). The materializer removes their
      // designs/index.ts + options.ts entries via the registry codemods.
      "designs/apex",
      "designs/atelier",
      "designs/aurora-shop",
      "designs/ember",
      "designs/halo",
      "designs/hoptify",
      "designs/northern-coffee",
      "designs/webshop-bold",
      "designs/webshop-classic",
      "designs/webshop-editorial",
      "designs/webshop-minimal",
    ),
    deps: [
      { name: "@stripe/react-stripe-js" },
      { name: "@stripe/stripe-js" },
      { name: "ai" },
      { name: "resend" },
      { name: "stripe" },
    ],
    knownDeviations: [
      "components/ProductCard.tsx imports the wishlist plugin's WishlistButton — a commerce materialization without the wishlist plugin needs a gate/seam (B4)",
      "admin's media routes (inside app/api/admin) import lib/media — a managed-site materialization (admin without webshop) hits that edge; media ownership split is B4",
    ],
    // webshop provides the commerce tool packs at mcp's registry seam
    // (`with` === `target`, same convention as db's B1 seams: the webshop
    // variant IS the on-disk content; only a no-webshop materialization
    // rewrites the target from commerce.static.ts).
    replaces: [
      { target: "lib/tools/packs/commerce.ts", with: "lib/tools/packs/commerce.ts" },
    ],
    prismaFragment: [
      "// webshop fragment (documentation in B2 — B3 assembles the physical schema).",
      "// Exclusive models: Category, Product, ProductVariant, Cart, CartItem,",
      "//   Order, OrderItem, OrderNote, Return, ReturnItem, DiscountCode,",
      "//   Subscription, ProcessedWebhookEvent, ShippingSettings, ShippingZone,",
      "//   ShippingRate, Supplier, FulfillmentOrder, AbandonedCartLog",
    ].join("\n"),
  }),
  node("feeds", "Merchant feeds", "ACP product feed + Google Merchant feed (the shared catalog-feed builder).", ["webshop"], "module", {
    files: inv("lib/feeds", "app/feed", "app/api/acp/feed"),
  }),
  node("mcp", "MCP + tool surface", "The public MCP server + REST tool registry (/api/mcp, /api/v1/tools) and agent keys. Default-on from managed-site upward (owner decision 2026-07-15).", ["db", "auth", "admin", "agent-core"], "module", {
    files: inv(
      "app/api/mcp",
      "app/api/v1",
      "lib/mcp",
      "lib/tools", // MONOLITH — see knownDeviations
      "app/.well-known/mcp.json",
      "lib/webmcp",
      "components/WebMcpRegistrar.tsx",
      "app/api/registry",
      "lib/registry-stats.ts",
      // The storefront AI assistant dispatches through the tool registry.
      "app/api/assistant",
      "docs/mcp.md",
      "docs/scopes-and-tools.md",
    ),
    deps: [
      { name: "@modelcontextprotocol/sdk" },
      { name: "@vercel/blob" },
      { name: "ai" },
    ],
    env: [
      {
        name: "MCP_ALLOWED_ORIGINS",
        required: false,
        example: "https://admin.example.com",
        docs: "Extra origins accepted by /api/mcp's Origin check. The shop's own URL — from brand.config or the domain set in the setup wizard — is always allowed; clients that send no Origin at all are unaffected.",
      },
    ],
    // B3 registry seam: the commerce tool packs are composed through this
    // target (on-disk = the webshop variant, re-exports; webshop `replaces`
    // it below). A managed-site materialization swaps in commerce.static.ts
    // (empty packs) instead.
    seams: ["lib/tools/packs/commerce.ts"],
    knownDeviations: [
      "the commerce tool packs (products/orders/discounts/categories/customer/address/subscriptions/analytics/marketing/ui/scraper) now compose through the lib/tools/packs/commerce.ts seam, but their files still live inside mcp's monolithic lib/tools claim — completing the B3 registry split requires the materializer to also EXCLUDE those pack files in a no-webshop profile",
      "audit/settings/sitepack/gdpr tool packs stay in the shared registry (they belong in managed-site) but read/write cross-module Prisma models — webshop's (product, shippingSettings, category, productVariant, order, orderItem via Order.items, subscription, cart) plus, for gdpr export/erase, the reviews plugin's ProductReview, acp's AcpCheckoutSession and the ownership-unassigned Lead model — a managed-site schema assembly must keep those models or the packs need model-tolerant handling (B3)",
      "posts reads the blog plugin's exclusive Post model, and google/sheets/docs/drive import google-workspace plugin code (lib/google/*) — plugin-coupled tool packs need the same seam/exclusion treatment when materializing without those plugins (B3)",
      "app/api/assistant/chat imports webshop libs (lib/cart, lib/pricing) — a managed-site materialization (mcp without webshop) needs those tool paths gated (B4)",
    ],
  }),
  node("acp", "ACP checkout", "Agentic Commerce Protocol checkout sessions incl. the SPT payment path.", ["webshop", "feeds", "agent-core"], "module", {
    files: inv("lib/acp", "app/api/acp/v1"),
    prismaFragment: [
      "// acp fragment (documentation in B2 — B3 assembles the physical schema).",
      "// Exclusive models: AcpCheckoutSession, AcpIdempotencyKey",
    ].join("\n"),
  }),
  node("a2a", "A2A", "Agent-to-agent negotiation, signed Agent Card, escrow verification, guardian adjudication.", ["webshop", "mcp", "agent-core"], "module", {
    files: inv(
      "app/api/negotiate",
      "app/api/agent-card",
      "app/api/escrow",
      "lib/a2a",
      "lib/guardian",
      "lib/escrow",
      "lib/negotiation",
    ),
    prismaFragment: [
      "// a2a fragment (documentation in B2 — B3 assembles the physical schema).",
      "// Exclusive models: AgentCard, EscrowTransaction, PoTEProof, AgenticJWT",
    ].join("\n"),
  }),
  node("ucp", "UCP", "Universal Commerce Protocol capability profile + OAuth identity-linking.", ["webshop", "mcp", "agent-core"], "module", {
    files: inv(
      "lib/ucp",
      "app/.well-known/ucp",
      "app/api/ucp",
      // OAuth authorization server routes: architecturally agent-core, but
      // every route file imports @/lib/ucp/* (oauth, authorize, gate) — so
      // ucp claims them until the OAuth implementation is extracted from
      // lib/ucp (agent-core's knownDeviations entry tracks the split).
      "app/oauth",
      "app/.well-known/oauth-authorization-server",
      "app/.well-known/oauth-protected-resource",
    ),
  }),
  // voice depends on mcp: lib/voice/tools.ts dispatches through the tool
  // registry (@/lib/tools/registry), and live dispatch reads lib/scopes via
  // mcp → agent-core transitively.
  node("voice", "Voice shopping", "Storefront voice/vision shopping features.", ["webshop", "mcp"], "module", {
    files: inv("lib/voice", "app/api/live", "components/voice"),
    deps: [{ name: "@google/genai" }, { name: "botid" }],
  }),
  node("agent-admin", "Agentic admin", "The agentic dashboard surfaces (agent keys usage, A2A/ACP status).", ["mcp", "admin"], "module", {
    // Inventory-empty by design in B2: its surfaces (app/admin/agentic,
    // app/admin/api-keys) live inside admin's monolith claim — subpages
    // split in B3. No overlapping claims allowed.
    files: [],
  }),
];

export const MODULES: readonly CartwrightModuleManifest[] = [
  ...MODULE_NODES,
  ...PLUGINS.map(wrapPlugin),
];

export function getModuleManifest(slug: string): CartwrightModuleManifest | undefined {
  return MODULES.find((m) => m.slug === slug);
}

// ── B4: dependency inventories → derived prune sets ─────────────────────────

const MODULE_MAP: ReadonlyMap<string, CartwrightModuleManifest> = new Map(
  MODULES.map((m) => [m.slug, m]),
);

/**
 * Packages carried by the UNCLAIMED, always-shipped app shell (files no
 * module inventories — they survive every materialization), so they can
 * never be pruned regardless of which modules declare them:
 *  - @sentry/nextjs: instrumentation*.ts, sentry.*.config.ts, next.config.ts
 *  - framer-motion: shell client components (app/[locale]/cases, LeadForm,
 *    components/ui/*) and core's info-page static variant — the phone-widget
 *    plugin ALSO declares it (live install semantics), which without this
 *    subtraction would make it site-prunable.
 * tests/unit/modules.test.ts grounds every entry against actual unclaimed
 * imports and asserts no OTHER prunable package is shell-imported.
 */
export const SHELL_DEPS: readonly string[] = ["@sentry/nextjs", "framer-motion"];

/**
 * npm packages a materialization that keeps ONLY `includedSlugs` (resolved
 * transitively; `core` is always seeded) can prune from package.json: every
 * package declared by at least one EXCLUDED module and by NO included one.
 *
 * The core baseline (next/react/next-intl/zod/…) is deliberately UNDECLARED —
 * modules only inventory what they carry beyond it — so the baseline can
 * never appear in a prune set. Repo-infra devDeps that belong to no module
 * (test runners: @playwright/test, fast-check, ts-node) are the CLI's
 * curated concern, not module data (apps/cli/src/materializer.ts).
 *
 * This is the B4 replacement for the CLI's curated SITE_PRUNED_DEPENDENCIES:
 * the materializer passes its final module set and prunes the result instead
 * of a hardcoded list. tests/unit/modules.test.ts pins parity between this
 * derivation and the curated list it supersedes.
 */
export function prunedDependenciesForModules(includedSlugs: readonly string[]): {
  deps: string[];
  devDeps: string[];
} {
  const included = resolveModuleSet(includedSlugs, MODULE_MAP);
  const keep = new Set<string>(SHELL_DEPS);
  const dropDeps = new Set<string>();
  const dropDevDeps = new Set<string>();
  for (const m of MODULES) {
    if (included.has(m.slug)) {
      for (const d of [...m.deps, ...m.devDeps]) keep.add(d.name);
    } else {
      for (const d of m.deps) dropDeps.add(d.name);
      for (const d of m.devDeps) dropDevDeps.add(d.name);
    }
  }
  return {
    deps: [...dropDeps].filter((n) => !keep.has(n)).sort(),
    devDeps: [...dropDevDeps].filter((n) => !keep.has(n) && !dropDeps.has(n)).sort(),
  };
}

// ── Profiles (additive supersets; aliases are permanent per owner decision) ──

export const PROFILES: readonly ProfileDefinition[] = [
  {
    schema: "cartwright-profile-v1",
    name: "site",
    description:
      "A plain owned website: pages, designs, SEO/JSON-LD. No database, no admin, no auth, no commerce, no agent surfaces. Optional: contact-form.",
    modules: [],
    aliases: [],
  },
  {
    schema: "cartwright-profile-v1",
    name: "managed-site",
    description:
      "Website with an admin: database, auth, essential admin, DB-backed pages, contact form, and the MCP/tool surface (agent-drivable site).",
    modules: ["db", "auth", "admin", "pages-db", "contact-form", "agent-core", "mcp"],
    aliases: ["light"],
  },
  {
    schema: "cartwright-profile-v1",
    name: "commerce",
    description: "The webshop: managed-site plus cart/checkout/orders and merchant feeds.",
    modules: ["db", "auth", "admin", "pages-db", "contact-form", "agent-core", "mcp", "webshop", "feeds"],
    aliases: [],
  },
  {
    schema: "cartwright-profile-v1",
    name: "agentic",
    description:
      "Everything: commerce plus ACP checkout, A2A, UCP, voice shopping and the agentic admin.",
    modules: [
      "db",
      "auth",
      "admin",
      "pages-db",
      "contact-form",
      "agent-core",
      "mcp",
      "webshop",
      "feeds",
      "acp",
      "a2a",
      "ucp",
      "voice",
      "agent-admin",
    ],
    aliases: ["full"],
  },
];

export function getProfile(nameOrAlias: string): ProfileDefinition | undefined {
  return PROFILES.find(
    (p) => p.name === nameOrAlias || p.aliases.includes(nameOrAlias),
  );
}
