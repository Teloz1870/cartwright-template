import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  PLUGIN_SCHEMA_ID,
  PluginManifestSchema,
  parsePluginManifest,
  toCatalogueEntry,
} from "@/lib/plugins/spec";
import { PLUGINS, getPluginManifest, pluginCatalogue } from "@/plugins/registry";
import { phoneWidgetPlugin } from "@/plugins/phone-widget/manifest";
import { brand } from "@/brand.config";
import { getDescriptor } from "@/lib/feature-flags/manifest";
import type { FeatureKey } from "@/lib/feature-flags/manifest";
import { NAV_GROUPS } from "@/lib/admin/nav";

/**
 * cartwright-plugin-v1 — contract validation, registry invariants and the
 * phone-widget round-trip. These are the mechanics-prover tests: a plugin
 * cannot be registered with an unknown flag, files that don't exist, unsafe
 * paths or unwired route mounts.
 */

const minimalValid = {
  schema: PLUGIN_SCHEMA_ID,
  slug: "test-plugin",
  name: "Test Plugin",
  description: "A test plugin.",
  version: "0.1.0",
  flag: "phoneWidget",
  files: [{ path: "plugins/test-plugin/manifest.ts" }],
};

describe("PluginManifestSchema (cartwright-plugin-v1)", () => {
  it("accepts a minimal manifest", () => {
    expect(PluginManifestSchema.safeParse(minimalValid).success).toBe(true);
  });

  it("accepts the full surface (routeMounts, adminNav, prismaFragment, deps)", () => {
    const result = PluginManifestSchema.safeParse({
      ...minimalValid,
      prismaFragment: "model TestThing { id String @id }",
      routeMounts: [
        {
          mount: "app/api/test/route.ts",
          from: "plugins/test-plugin/api/handler.ts",
          exports: ["GET", "POST"],
        },
      ],
      adminNav: [{ href: "/admin/test", label: "Test" }],
      deps: [{ name: "left-pad", version: "^1.0.0" }],
    });
    expect(result.success).toBe(true);
  });

  it("is forward-compatible: unknown future fields are accepted silently", () => {
    const result = PluginManifestSchema.safeParse({
      ...minimalValid,
      tools: [{ name: "do-thing" }],
      events: { "order.placed": "plugins/test-plugin/events/onOrder.ts" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a wrong schema id", () => {
    expect(
      PluginManifestSchema.safeParse({ ...minimalValid, schema: "cartwright-plugin-v2" }).success,
    ).toBe(false);
  });

  it("rejects a non-kebab-case slug", () => {
    for (const slug of ["PhoneWidget", "phone_widget", "-phone", "phone-", "2fast"]) {
      expect(PluginManifestSchema.safeParse({ ...minimalValid, slug }).success).toBe(false);
    }
  });

  it("rejects an invalid semver version", () => {
    for (const version of ["1.0", "v1.0.0", "not-a-version", "01.2.3"]) {
      expect(PluginManifestSchema.safeParse({ ...minimalValid, version }).success).toBe(false);
    }
  });

  it("rejects unsafe file paths (traversal, absolute, URL, backslash)", () => {
    for (const p of [
      "../escape.ts",
      "plugins/x/../../escape.ts",
      "/etc/passwd",
      "https://evil.com/x.ts",
      "plugins\\x\\manifest.ts",
    ]) {
      expect(
        PluginManifestSchema.safeParse({ ...minimalValid, files: [{ path: p }] }).success,
      ).toBe(false);
    }
  });

  it("rejects a file carrying both contents and registryRef", () => {
    const result = PluginManifestSchema.safeParse({
      ...minimalValid,
      files: [{ path: "plugins/test-plugin/a.ts", contents: "export {}", registryRef: "r:a" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects route mounts outside app/ and implementations outside plugins/", () => {
    expect(
      PluginManifestSchema.safeParse({
        ...minimalValid,
        routeMounts: [
          { mount: "lib/sneaky.ts", from: "plugins/test-plugin/x.ts", exports: ["GET"] },
        ],
      }).success,
    ).toBe(false);
    expect(
      PluginManifestSchema.safeParse({
        ...minimalValid,
        routeMounts: [{ mount: "app/api/x/route.ts", from: "lib/core.ts", exports: ["GET"] }],
      }).success,
    ).toBe(false);
  });

  it("rejects an empty files array", () => {
    expect(PluginManifestSchema.safeParse({ ...minimalValid, files: [] }).success).toBe(false);
  });

  it("parsePluginManifest throws a readable error", () => {
    expect(() => parsePluginManifest({ ...minimalValid, version: "nope" })).toThrow(
      /Invalid cartwright-plugin-v1 manifest at version/,
    );
  });
});

describe("plugin registry invariants", () => {
  it("every registered plugin is schema-valid", () => {
    for (const plugin of PLUGINS) {
      const result = PluginManifestSchema.safeParse(plugin);
      expect(
        result.success,
        `plugin "${plugin.slug}": ${result.success ? "" : result.error.issues[0]?.message}`,
      ).toBe(true);
    }
  });

  it("slugs are unique and match the plugins/<slug>/ directory convention", () => {
    const slugs = PLUGINS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const plugin of PLUGINS) {
      expect(
        plugin.files.some((f) => f.path.startsWith(`plugins/${plugin.slug}/`)),
        `plugin "${plugin.slug}" must own files under plugins/${plugin.slug}/`,
      ).toBe(true);
    }
  });

  it("every plugin flag is a real brand.features key with a manifest descriptor", () => {
    const features = brand.features as Record<string, boolean>;
    for (const plugin of PLUGINS) {
      expect(plugin.flag in features, `flag "${plugin.flag}" (plugin "${plugin.slug}")`).toBe(true);
      expect(
        getDescriptor(plugin.flag as FeatureKey),
        `descriptor for "${plugin.flag}"`,
      ).toBeTruthy();
    }
  });

  it("every declared file exists on disk (in-repo plugins are the source of truth)", () => {
    for (const plugin of PLUGINS) {
      for (const file of plugin.files) {
        expect(
          existsSync(path.resolve(process.cwd(), file.path)),
          `plugin "${plugin.slug}" file missing: ${file.path}`,
        ).toBe(true);
      }
    }
  });

  it("route mounts are wired: mount + impl are declared files, and the mount re-exports the impl", () => {
    for (const plugin of PLUGINS) {
      const declared = new Set(plugin.files.map((f) => f.path));
      for (const rm of plugin.routeMounts ?? []) {
        expect(declared.has(rm.mount), `mount ${rm.mount} must be in files`).toBe(true);
        expect(declared.has(rm.from), `impl ${rm.from} must be in files`).toBe(true);

        const mountSrc = readFileSync(path.resolve(process.cwd(), rm.mount), "utf-8");
        const specifier = `@/${rm.from.replace(/\.(ts|tsx)$/, "")}`;
        expect(
          mountSrc.includes(specifier),
          `mount ${rm.mount} must re-export from "${specifier}"`,
        ).toBe(true);
        for (const exp of rm.exports) {
          expect(
            mountSrc.includes(exp),
            `mount ${rm.mount} must forward export "${exp}"`,
          ).toBe(true);
        }
      }
    }
  });

  it("adminNav entries point at admin routes the engine actually renders in NAV_GROUPS", () => {
    const navHrefs = new Set(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href)));
    for (const plugin of PLUGINS) {
      for (const entry of plugin.adminNav ?? []) {
        expect(navHrefs.has(entry.href), `nav href ${entry.href} (plugin "${plugin.slug}")`).toBe(
          true,
        );
      }
    }
  });

  it("getPluginManifest + pluginCatalogue derive from the registry", () => {
    expect(getPluginManifest("phone-widget")).toBe(phoneWidgetPlugin);
    expect(getPluginManifest("does-not-exist")).toBeUndefined();
    expect(pluginCatalogue()).toEqual(PLUGINS.map(toCatalogueEntry));
  });
});

describe("phone-widget manifest round-trip (the first plugin)", () => {
  it("survives JSON serialisation and re-parsing unchanged", () => {
    const roundTripped = parsePluginManifest(JSON.parse(JSON.stringify(phoneWidgetPlugin)));
    expect(roundTripped).toEqual(phoneWidgetPlugin);
  });

  it("gates on the phoneWidget flag and mounts the known phone surfaces", () => {
    expect(phoneWidgetPlugin.flag).toBe("phoneWidget");
    const mounts = (phoneWidgetPlugin.routeMounts ?? []).map((m) => m.mount).sort();
    expect(mounts).toEqual([
      "app/admin/telefon/page.tsx",
      "app/api/admin/phone/route.ts",
      "app/api/phone/token/route.ts",
      "app/api/phone/webhook/route.ts",
    ]);
    // The storefront import shim stays so existing scaffolds keep working.
    expect(phoneWidgetPlugin.files.some((f) => f.path === "components/ui/PhoneWidget.tsx")).toBe(
      true,
    );
  });

  it("declares no prisma fragment (workspace-id column ships in the core schema)", () => {
    expect(phoneWidgetPlugin.prismaFragment).toBeUndefined();
  });
});

describe("plugin wave 2 — wishlist, blog, reviews", () => {
  const wave2 = ["wishlist", "blog", "reviews"] as const;

  it("all three are registered and gate on their own flag", () => {
    for (const slug of wave2) {
      const plugin = getPluginManifest(slug);
      expect(plugin, `plugin "${slug}" must be registered`).toBeTruthy();
      expect(plugin!.flag).toBe(slug);
    }
  });

  it("each survives JSON serialisation and re-parsing unchanged", () => {
    for (const slug of wave2) {
      const plugin = getPluginManifest(slug)!;
      const roundTripped = parsePluginManifest(JSON.parse(JSON.stringify(plugin)));
      expect(roundTripped).toEqual(plugin);
    }
  });

  it("wishlist mounts the account page + toggle/list API and declares the WishlistItem fragment", () => {
    const plugin = getPluginManifest("wishlist")!;
    const mounts = (plugin.routeMounts ?? []).map((m) => m.mount).sort();
    expect(mounts).toEqual([
      "app/[locale]/account/wishlist/page.tsx",
      "app/api/wishlist/route.ts",
      "app/api/wishlist/toggle/route.ts",
    ]);
    // The PLP/PDP import shims stay so existing scaffolds keep working.
    expect(plugin.files.some((f) => f.path === "components/WishlistButton.tsx")).toBe(true);
    expect(plugin.files.some((f) => f.path === "lib/wishlist.ts")).toBe(true);
    expect(plugin.prismaFragment).toContain("model WishlistItem");
  });

  it("blog mounts storefront + RSS + admin and declares the Post fragment", () => {
    const plugin = getPluginManifest("blog")!;
    const mounts = (plugin.routeMounts ?? []).map((m) => m.mount).sort();
    expect(mounts).toEqual([
      "app/[locale]/blog/[slug]/page.tsx",
      "app/[locale]/blog/page.tsx",
      "app/admin/blog/[id]/page.tsx",
      "app/admin/blog/nyt/page.tsx",
      "app/admin/blog/page.tsx",
      "app/blog/feed.xml/route.ts",
    ]);
    expect(plugin.files.some((f) => f.path === "lib/blog.ts")).toBe(true);
    expect(plugin.files.some((f) => f.path === "components/BlogContent.tsx")).toBe(true);
    expect(plugin.prismaFragment).toContain("model Post");
    expect(plugin.adminNav).toEqual([{ href: "/admin/blog", label: "Blog" }]);
  });

  it("reviews mounts submit/cron/pages/admin and declares the review fragments", () => {
    const plugin = getPluginManifest("reviews")!;
    const mounts = (plugin.routeMounts ?? []).map((m) => m.mount).sort();
    expect(mounts).toEqual([
      "app/[locale]/account/orders/[id]/review/page.tsx",
      "app/[locale]/review/[token]/page.tsx",
      "app/admin/anmeldelser/[id]/page.tsx",
      "app/admin/anmeldelser/page.tsx",
      "app/api/cron/review-prompt/route.ts",
      "app/api/reviews/route.ts",
    ]);
    // The PDP import shims stay so existing scaffolds keep working.
    expect(plugin.files.some((f) => f.path === "components/ReviewList.tsx")).toBe(true);
    expect(plugin.files.some((f) => f.path === "components/WriteReviewForm.tsx")).toBe(true);
    expect(plugin.files.some((f) => f.path === "lib/reviews.ts")).toBe(true);
    expect(plugin.prismaFragment).toContain("model ProductReview");
    expect(plugin.prismaFragment).toContain("model ReviewPromptLog");
    expect(plugin.adminNav).toEqual([{ href: "/admin/anmeldelser", label: "Reviews" }]);
  });
});

describe("plugin wave 3 — three-scenes", () => {
  it("is registered, gates on threeD and survives a JSON round-trip", () => {
    const plugin = getPluginManifest("three-scenes");
    expect(plugin, 'plugin "three-scenes" must be registered').toBeTruthy();
    expect(plugin!.flag).toBe("threeD");
    const roundTripped = parsePluginManifest(JSON.parse(JSON.stringify(plugin)));
    expect(roundTripped).toEqual(plugin);
  });

  it("mounts the admin config page + scene preview and shims the design-pack entry points", () => {
    const plugin = getPluginManifest("three-scenes")!;
    const mounts = (plugin.routeMounts ?? []).map((m) => m.mount).sort();
    expect(mounts).toEqual(["app/[locale]/scene-preview/page.tsx", "app/admin/three-d/page.tsx"]);
    // The design-pack import shims stay so existing scaffolds keep working.
    expect(plugin.files.some((f) => f.path === "components/ThreeHero.tsx")).toBe(true);
    expect(plugin.files.some((f) => f.path === "components/DesignHero.tsx")).toBe(true);
    // The registry shim is load-bearing for the core scene-id vocabulary
    // (lib/three/resolve+apply, lib/compositions/spec, manifest generator).
    expect(plugin.files.some((f) => f.path === "lib/three/scenes/registry.ts")).toBe(true);
    expect(plugin.adminNav).toEqual([{ href: "/admin/three-d", label: "Live Canvas (3D)" }]);
  });

  it("declares the three.js deps and no prisma fragment (threeDConfigJson is a core column)", () => {
    const plugin = getPluginManifest("three-scenes")!;
    expect((plugin.deps ?? []).map((d) => d.name).sort()).toEqual(["@types/three", "three"]);
    expect(plugin.prismaFragment).toBeUndefined();
  });

  it("every scene the registry exposes ships as a plugin file (no orphan scene ids)", async () => {
    const { SCENE_IDS } = await import("@/plugins/three-scenes/scenes/registry");
    const plugin = getPluginManifest("three-scenes")!;
    const declared = new Set(plugin.files.map((f) => f.path));
    for (const id of SCENE_IDS) {
      expect(
        declared.has(`plugins/three-scenes/scenes/${id}.ts`),
        `scene "${id}" must be a declared plugin file`,
      ).toBe(true);
    }
  });
});

describe("plugin wave 4 — hoptify", () => {
  it("is registered, gates on hoptify and survives a JSON round-trip", () => {
    const plugin = getPluginManifest("hoptify");
    expect(plugin, 'plugin "hoptify" must be registered').toBeTruthy();
    expect(plugin!.flag).toBe("hoptify");
    const roundTripped = parsePluginManifest(JSON.parse(JSON.stringify(plugin)));
    expect(roundTripped).toEqual(plugin);
  });

  it("mounts the admin migration page and shims the historical import paths", () => {
    const plugin = getPluginManifest("hoptify")!;
    const mounts = (plugin.routeMounts ?? []).map((m) => m.mount).sort();
    expect(mounts).toEqual(["app/admin/hoptify/page.tsx"]);
    // The import shims stay so existing scaffolds + tests keep working.
    expect(plugin.files.some((f) => f.path === "lib/hoptify/migrate.ts")).toBe(true);
    expect(plugin.files.some((f) => f.path === "app/admin/hoptify/actions.ts")).toBe(true);
    expect(plugin.files.some((f) => f.path === "app/admin/hoptify/HopMigrate.tsx")).toBe(true);
    expect(plugin.adminNav).toEqual([{ href: "/admin/hoptify", label: "Hop off Shopify 🐸" }]);
  });

  it("declares the MigrationJob fragment and no extra deps (Firecrawl machinery stays core)", () => {
    const plugin = getPluginManifest("hoptify")!;
    expect(plugin.prismaFragment).toContain("model MigrationJob");
    expect(plugin.deps).toBeUndefined();
  });

  it("does NOT claim the design pack — designs/hoptify stays design-system material", () => {
    const plugin = getPluginManifest("hoptify")!;
    expect(plugin.files.some((f) => f.path.startsWith("designs/"))).toBe(false);
  });
});

describe("logo-generator plugin", () => {
  it("is registered, gates on logoGenerator and survives a JSON round-trip", () => {
    const plugin = getPluginManifest("logo-generator");
    expect(plugin, 'plugin "logo-generator" must be registered').toBeTruthy();
    expect(plugin!.flag).toBe("logoGenerator");
    const roundTripped = parsePluginManifest(JSON.parse(JSON.stringify(plugin)));
    expect(roundTripped).toEqual(plugin);
  });

  it("mounts the admin-guarded generate-logo endpoint and shims the historical paths", () => {
    const plugin = getPluginManifest("logo-generator")!;
    const mounts = (plugin.routeMounts ?? []).map((m) => m.mount).sort();
    expect(mounts).toEqual(["app/api/admin/generate-logo/route.ts"]);
    // The lib + settings-page import shims stay so existing scaffolds keep working.
    expect(plugin.files.some((f) => f.path === "lib/ai/logo-gen.ts")).toBe(true);
    expect(plugin.files.some((f) => f.path === "app/admin/indstillinger/LogoForm.tsx")).toBe(true);
  });

  it("keeps the requireAdminApi() guard in the mounted handler implementation", () => {
    // The guard is load-bearing (parity audit #1, hardened in #236/#241):
    // without it the route is an open, unauthenticated LLM proxy.
    const impl = readFileSync(
      path.resolve(process.cwd(), "plugins/logo-generator/api/generate-logo.ts"),
      "utf-8",
    );
    expect(impl).toMatch(/requireAdminApi\s*\(/);
    expect(impl).toMatch(/instanceof\s+Response/);
  });

  it("declares no prisma fragment (logo columns live on core BrandingSettings) and only shared core deps", () => {
    const plugin = getPluginManifest("logo-generator")!;
    expect(plugin.prismaFragment).toBeUndefined();
    // @vercel/blob is a shared core dep (backup/media/upload routes) declared
    // for light-scaffold honesty; @google/genai must NOT be claimed — the
    // plugin reaches Gemini through the shared core lib/ai/gemini.ts.
    expect((plugin.deps ?? []).map((d) => d.name)).toEqual(["@vercel/blob"]);
  });
});

describe("design-import plugin", () => {
  it("is registered, gates on designImport and survives a JSON round-trip", () => {
    const plugin = getPluginManifest("design-import");
    expect(plugin, 'plugin "design-import" must be registered').toBeTruthy();
    expect(plugin!.flag).toBe("designImport");
    const roundTripped = parsePluginManifest(JSON.parse(JSON.stringify(plugin)));
    expect(roundTripped).toEqual(plugin);
  });

  it("mounts the admin import page and shims the historical import paths", () => {
    const plugin = getPluginManifest("design-import")!;
    const mounts = (plugin.routeMounts ?? []).map((m) => m.mount).sort();
    expect(mounts).toEqual(["app/admin/design-import/page.tsx"]);
    // The import shims stay so the core design tools (lib/tools/design.ts),
    // the hoptify plugin and existing scaffolds + tests keep working.
    expect(plugin.files.some((f) => f.path === "lib/design-import/extract.ts")).toBe(true);
    expect(plugin.files.some((f) => f.path === "lib/design-import/apply.ts")).toBe(true);
    expect(plugin.files.some((f) => f.path === "app/admin/design-import/actions.ts")).toBe(true);
    expect(
      plugin.files.some((f) => f.path === "app/admin/design-import/DesignImportForm.tsx"),
    ).toBe(true);
    expect(plugin.adminNav).toEqual([{ href: "/admin/design-import", label: "Design import" }]);
  });

  it("keeps the requireAdmin() guards in the mounted page and both server actions", () => {
    // The guards are load-bearing (parity-audit #1 class): without them the
    // import page and the extract/apply actions are open to any visitor.
    const page = readFileSync(
      path.resolve(process.cwd(), "plugins/design-import/admin/DesignImportAdminPage.tsx"),
      "utf-8",
    );
    expect(page).toMatch(/await\s+requireAdmin\s*\(/);
    const actions = readFileSync(
      path.resolve(process.cwd(), "plugins/design-import/admin/actions.ts"),
      "utf-8",
    );
    expect(actions.match(/await\s+requireAdmin\s*\(/g)?.length).toBe(2);
  });

  it("declares no prisma fragment (themeJson is a core BrandingSettings column) and no deps (Firecrawl machinery stays core)", () => {
    const plugin = getPluginManifest("design-import")!;
    expect(plugin.prismaFragment).toBeUndefined();
    expect(plugin.deps).toBeUndefined();
  });
});

describe("google-workspace plugin", () => {
  it("is registered, gates on sheetsSync (the flag-bundle decision) and survives a JSON round-trip", () => {
    const plugin = getPluginManifest("google-workspace");
    expect(plugin, 'plugin "google-workspace" must be registered').toBeTruthy();
    // ONE manifest flag for a three-flag bundle: sheetsSync is the designated
    // flag-bearer; docsImport + googleDrive keep gating their features
    // individually (documented in the manifest header). NOT googleAuth — that
    // is the compile-time NextAuth customer-login flag in core lib/auth.ts,
    // which never belonged to this connector (audit-drift, see manifest).
    expect(plugin!.flag).toBe("sheetsSync");
    const roundTripped = parsePluginManifest(JSON.parse(JSON.stringify(plugin)));
    expect(roundTripped).toEqual(plugin);
  });

  it("mounts the three admin pages, the OAuth pair and both crons", () => {
    const plugin = getPluginManifest("google-workspace")!;
    const mounts = (plugin.routeMounts ?? []).map((m) => m.mount).sort();
    expect(mounts).toEqual([
      "app/admin/docs-import/page.tsx",
      "app/admin/drive/page.tsx",
      "app/admin/sheets/page.tsx",
      "app/api/cron/drive-backup/route.ts",
      "app/api/cron/sheets-sync/route.ts",
      "app/api/google/oauth/callback/route.ts",
      "app/api/google/oauth/initiate/route.ts",
    ]);
  });

  it("shims every historical import path (core tools + integrations page + tests resolve through these)", () => {
    const plugin = getPluginManifest("google-workspace")!;
    const declared = new Set(plugin.files.map((f) => f.path));
    for (const shim of [
      "lib/google/oauth.ts",
      "lib/google/client.ts",
      "lib/google/scopes.ts",
      "lib/google/sheets.ts",
      "lib/google/docs.ts",
      "lib/google/drive.ts",
      "lib/sheets/sync.ts",
      "lib/media/google-drive-import.ts",
      "lib/backup/google-drive.ts",
      "app/admin/sheets/actions.ts",
      "app/admin/docs-import/actions.ts",
      "app/admin/docs-import/DocsImportForm.tsx",
      "app/admin/drive/actions.ts",
    ]) {
      expect(declared.has(shim), `shim ${shim} must be a declared file`).toBe(true);
    }
  });

  it("keeps the auth guards in the mounted handler implementations", () => {
    // Guard-presence regression (logo-generator precedent, adapted to what
    // these guards actually are): the OAuth pair guards with an admin-session
    // check (redirect-to-login semantics — a browser flow, not a JSON API),
    // the crons guard with CRON_SECRET, and every moved server action calls
    // requireAdmin(). None of these may be lost in a future move.
    for (const impl of [
      "plugins/google-workspace/api/oauth-initiate.ts",
      "plugins/google-workspace/api/oauth-callback.ts",
    ]) {
      const src = readFileSync(path.resolve(process.cwd(), impl), "utf-8");
      expect(src, `${impl} must keep the admin-session guard`).toMatch(
        /session\.user\.role !== "admin"/,
      );
      expect(src, `${impl} must redirect unauthenticated users to login`).toContain(
        "/account/login",
      );
    }
    for (const impl of [
      "plugins/google-workspace/api/sheets-sync-cron.ts",
      "plugins/google-workspace/api/drive-backup-cron.ts",
    ]) {
      const src = readFileSync(path.resolve(process.cwd(), impl), "utf-8");
      expect(src, `${impl} must keep the CRON_SECRET guard`).toContain("CRON_SECRET");
      expect(src, `${impl} must 401 on a bad bearer`).toMatch(/status:\s*401/);
    }
    for (const impl of [
      "plugins/google-workspace/admin/sheets/actions.ts",
      "plugins/google-workspace/admin/docs-import/actions.ts",
      "plugins/google-workspace/admin/drive/actions.ts",
    ]) {
      const src = readFileSync(path.resolve(process.cwd(), impl), "utf-8");
      expect(src, `${impl} must keep requireAdmin()`).toMatch(/requireAdmin\s*\(/);
    }
  });

  it("declares the GoogleConnection fragment (plugin-exclusive singleton) and only shared core deps", () => {
    const plugin = getPluginManifest("google-workspace")!;
    expect(plugin.prismaFragment).toContain("model GoogleConnection");
    // @vercel/blob is a shared core dep (backup/media/upload routes) declared
    // for light-scaffold honesty — same reasoning as logo-generator.
    expect((plugin.deps ?? []).map((d) => d.name)).toEqual(["@vercel/blob"]);
    // No adminNav: the three pages are deliberately not in NAV_GROUPS
    // (lib/admin/nav.ts folds them into /admin/integrations).
    expect(plugin.adminNav).toBeUndefined();
  });
});
