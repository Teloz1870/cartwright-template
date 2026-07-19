import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";

import {
  MODULE_SCHEMA_ID,
  ModuleManifestSchema,
  parseModuleManifest,
  resolveModuleSet,
  validateModuleGraph,
  type CartwrightModuleManifest,
} from "@/lib/modules/spec";
import { MODULES, PROFILES, getModuleManifest, getProfile } from "@/modules/registry";
import { PLUGINS } from "@/plugins/registry";

/**
 * cartwright-module-v1 — contract + graph invariants (site-profile program
 * Fase 1 slice A; ultraplan owner-approved 2026-07-15). Mechanics-prover
 * tests in the plugins.test.ts tradition: the registry cannot drift into an
 * unresolvable/cyclic graph, profiles cannot stop being additive supersets,
 * and the plugin wrap cannot lose plugin semantics.
 */

const bySlug = new Map(MODULES.map((m) => [m.slug, m]));

describe("cartwright-module-v1 — schema", () => {
  it("every registered module parses against the schema", () => {
    for (const m of MODULES) expect(() => parseModuleManifest(m)).not.toThrow();
  });

  it("rejects a bad kind, a non-kebab slug and an unsafe path", () => {
    const base = getModuleManifest("db")!;
    expect(ModuleManifestSchema.safeParse({ ...base, kind: "mega" }).success).toBe(false);
    expect(ModuleManifestSchema.safeParse({ ...base, slug: "Not Kebab" }).success).toBe(false);
    expect(
      ModuleManifestSchema.safeParse({ ...base, seams: ["../outside.ts"] }).success,
    ).toBe(false);
  });

  it("is forward-compatible: unknown future fields parse silently", () => {
    const m = { ...getModuleManifest("db")!, futureField: { anything: true } };
    expect(() => parseModuleManifest(m)).not.toThrow();
  });
});

describe("module graph — validity", () => {
  it("the shipped registry validates with zero errors", () => {
    expect(validateModuleGraph(MODULES)).toEqual([]);
  });

  it("exactly one core module, with no dependencies", () => {
    const cores = MODULES.filter((m) => m.kind === "core");
    expect(cores).toHaveLength(1);
    expect(cores[0]!.slug).toBe("core");
    expect(cores[0]!.dependsOn).toEqual([]);
  });

  it("unique slugs across modules AND plugins", () => {
    expect(bySlug.size).toBe(MODULES.length);
  });

  it("detects an unknown dependsOn target", () => {
    const broken: CartwrightModuleManifest = {
      ...getModuleManifest("voice")!,
      slug: "broken",
      dependsOn: ["does-not-exist"],
    };
    const errors = validateModuleGraph([...MODULES, broken]);
    expect(errors.some((e) => e.includes('unknown module "does-not-exist"'))).toBe(true);
  });

  it("detects a dependency cycle", () => {
    const a: CartwrightModuleManifest = { ...getModuleManifest("db")!, slug: "cyc-a", dependsOn: ["cyc-b"] };
    const b: CartwrightModuleManifest = { ...getModuleManifest("db")!, slug: "cyc-b", dependsOn: ["cyc-a"] };
    const errors = validateModuleGraph([...MODULES, a, b]);
    expect(errors.some((e) => e.includes("dependency cycle"))).toBe(true);
  });

  it("detects a replaces-target that no module declares as a seam", () => {
    const rogue: CartwrightModuleManifest = {
      ...getModuleManifest("db")!,
      slug: "rogue",
      replaces: [{ target: "lib/brand.ts", with: "lib/brand.db.ts" }],
    };
    const errors = validateModuleGraph([...MODULES, rogue]);
    expect(errors.some((e) => e.includes('undeclared seam "lib/brand.ts"'))).toBe(true);
  });

  it("every declared module file exists on disk (inventories point at real paths, never wrong)", () => {
    const root = process.cwd();
    for (const m of MODULES) {
      for (const f of m.files) {
        expect(existsSync(path.join(root, f.path)), `${m.slug}: missing ${f.path}`).toBe(true);
      }
    }
  });
});

describe("B2 inventories — single-owner claims", () => {
  const nonPlugin = MODULES.filter((m) => m.kind !== "plugin");

  it("every non-plugin module except agent-admin carries a B2 inventory", () => {
    for (const m of nonPlugin) {
      if (m.slug === "agent-admin") {
        // Deliberately inventory-empty: its surfaces live inside admin's
        // monolith claim (app/admin) until the B3 subpage split.
        expect(m.files).toEqual([]);
      } else {
        expect(m.files.length, `${m.slug}: expected a non-empty inventory`).toBeGreaterThan(0);
      }
    }
  });

  it("no path is claimed twice across ALL modules (plugins included)", () => {
    const seen = new Map<string, string>();
    for (const m of MODULES) {
      for (const f of m.files) {
        const norm = f.path.replace(/\/+$/, "");
        const owner = seen.get(norm);
        expect(owner, `${norm} claimed by both ${owner} and ${m.slug}`).toBeUndefined();
        seen.set(norm, m.slug);
      }
    }
  });

  it("no non-plugin claim lives INSIDE another non-plugin module's claimed directory", () => {
    // Segment-aware prefix check: `a` is inside dir claim `b` iff a startsWith b + "/".
    // Scoped to non-plugin nodes: plugin route mounts intentionally live inside
    // module monolith claims (e.g. app/admin/blog under admin's app/admin) —
    // the plugin system, not the module union, prunes/re-creates those mounts.
    //
    // B3 exemption: a `<name>.static.<ext>` SEAM VARIANT may live inside the
    // provider's claimed directory (the variant must sit next to its target —
    // e.g. core's info-page static inside pages-db's app/[locale]/info claim).
    // Valid only when the matching target path is a declared seam; the
    // materializer copies the variant over the target BEFORE deleting the
    // provider's claim and removes leftover variants afterwards.
    const declaredSeams = new Set(MODULES.flatMap((m) => m.seams));
    const isSeamVariant = (path: string) => {
      const m = path.match(/^(.*)\.static\.([a-z]+)$/);
      return m !== null && declaredSeams.has(`${m[1]}.${m[2]}`);
    };
    const claims: Array<{ slug: string; path: string }> = nonPlugin.flatMap((m) =>
      m.files.map((f) => ({ slug: m.slug, path: f.path.replace(/\/+$/, "") })),
    );
    for (const a of claims) {
      if (isSeamVariant(a.path)) continue;
      for (const b of claims) {
        if (a.slug === b.slug) continue;
        expect(
          a.path.startsWith(`${b.path}/`),
          `${a.slug}:${a.path} is inside ${b.slug}'s claim ${b.path}`,
        ).toBe(false);
      }
    }
  });

  it("agent-core owns ONLY the key/scope surface and depends only on db", () => {
    const ac = getModuleManifest("agent-core")!;
    expect(ac.kind).toBe("module");
    expect(ac.dependsOn).toEqual(["db"]);
    const paths = ac.files.map((f) => f.path);
    expect(paths).toContain("lib/api-auth.ts");
    expect(paths).toContain("lib/scopes.ts");
    // The OAuth server routes import @/lib/ucp/* — ucp claims them in B2
    // (codex fold-in #381); agent-core records the pending split instead.
    expect(paths).not.toContain("app/oauth");
    expect(ac.knownDeviations?.some((d) => d.includes("lib/ucp"))).toBe(true);
  });

  it("ucp claims the OAuth authorization server routes (implementation lives in lib/ucp)", () => {
    const paths = getModuleManifest("ucp")!.files.map((f) => f.path);
    expect(paths).toContain("app/oauth");
    expect(paths).toContain("app/.well-known/oauth-authorization-server");
    expect(paths).toContain("app/.well-known/oauth-protected-resource");
  });

  it("voice depends on mcp (lib/voice/tools.ts dispatches through the tool registry)", () => {
    expect(getModuleManifest("voice")!.dependsOn).toContain("mcp");
    const resolved = resolveModuleSet(["voice"], bySlug);
    expect(resolved.has("mcp")).toBe(true);
    expect(resolved.has("agent-core")).toBe(true);
  });

  it("mcp, acp, a2a and ucp all resolve agent-core transitively", () => {
    for (const slug of ["mcp", "acp", "a2a", "ucp"]) {
      const resolved = resolveModuleSet([slug], bySlug);
      expect(resolved.has("agent-core"), `${slug} must pull in agent-core`).toBe(true);
    }
  });

  it("knownDeviations: honesty ledger set where code and boundary disagree", () => {
    expect(
      getModuleManifest("mcp")!.knownDeviations?.some((d) => d.includes("B3 registry split")),
    ).toBe(true);
    expect(getModuleManifest("auth")!.knownDeviations?.length).toBeGreaterThan(0);
    expect(getModuleManifest("core")!.knownDeviations?.length).toBeGreaterThan(0);
    // Schema round-trip keeps the field.
    const parsed = parseModuleManifest(getModuleManifest("mcp")!);
    expect(parsed.knownDeviations?.length).toBeGreaterThan(0);
  });

  it("prismaFragments stay documentation in B2 (comment-style text blocks)", () => {
    for (const m of MODULES) {
      if (m.kind === "plugin" || !m.prismaFragment) continue;
      expect(m.prismaFragment.startsWith("//"), `${m.slug}: fragment must be comment-style`).toBe(
        true,
      );
    }
  });
});

describe("plugin wrapping — semantics preserved 1:1", () => {
  it("all 9 plugins are wrapped, kind=plugin, flag/prismaFragment verbatim, manifest files a verbatim prefix", () => {
    for (const p of PLUGINS) {
      const m = getModuleManifest(p.slug);
      expect(m, `plugin ${p.slug} missing from module registry`).toBeDefined();
      expect(m!.kind).toBe("plugin");
      expect(m!.flag).toBe(p.flag);
      // B3: the wrapped module may carry EXTRA files for materialization
      // (PLUGIN_MODULE_EXTRAS) — the live plugin manifest's files must still
      // be present verbatim, as a prefix, so runtime install/uninstall
      // semantics are provably untouched.
      expect(m!.files.slice(0, p.files.length)).toEqual(p.files);
      expect(m!.prismaFragment).toEqual(p.prismaFragment);
      expect(m!.dependsOn).toEqual(["db", "admin"]);
    }
  });

  it("B3 plugin-module extras never re-claim files the live plugin manifest owns", () => {
    for (const p of PLUGINS) {
      const m = getModuleManifest(p.slug)!;
      const manifestPaths = new Set(p.files.map((f) => f.path));
      const extras = m.files.slice(p.files.length);
      for (const f of extras) {
        expect(
          manifestPaths.has(f.path),
          `${p.slug}: extra ${f.path} duplicates a manifest claim`,
        ).toBe(false);
      }
    }
  });

  it("three-scenes provides the 3D seams (ThreeHero/DesignHero/resolve)", () => {
    const m = getModuleManifest("three-scenes")!;
    const targets = m.replaces.map((r) => r.target);
    expect(targets).toContain("components/ThreeHero.tsx");
    expect(targets).toContain("components/DesignHero.tsx");
    expect(targets).toContain("lib/three/resolve.ts");
  });

  it("non-plugin nodes never carry a runtime flag (modules are compile-time set members)", () => {
    for (const m of MODULES) {
      if (m.kind !== "plugin") expect(m.flag, `${m.slug} must not have a flag`).toBeUndefined();
    }
  });
});

describe("profiles — the additive superset contract", () => {
  const order = ["site", "managed-site", "commerce", "agentic"] as const;

  it("all four profiles exist and every referenced module resolves", () => {
    for (const name of order) {
      const p = getProfile(name);
      expect(p, name).toBeDefined();
      expect(() => resolveModuleSet(p!.modules, bySlug)).not.toThrow();
    }
  });

  it("site ⊂ managed-site ⊂ commerce ⊂ agentic (resolved, strictly growing)", () => {
    let prev = new Set<string>();
    for (const name of order) {
      const resolved = resolveModuleSet(getProfile(name)!.modules, bySlug);
      for (const slug of prev) expect(resolved.has(slug), `${name} lost ${slug}`).toBe(true);
      expect(resolved.size).toBeGreaterThanOrEqual(prev.size);
      prev = resolved;
    }
    expect(prev.size).toBeGreaterThan(resolveModuleSet(getProfile("site")!.modules, bySlug).size);
  });

  it("EVERY resolved profile includes core — site resolves to exactly {core}, never ∅ (codex fold-in)", () => {
    for (const name of order) {
      const resolved = resolveModuleSet(getProfile(name)!.modules, bySlug);
      expect(resolved.has("core"), `${name} must include core`).toBe(true);
    }
    expect([...resolveModuleSet(getProfile("site")!.modules, bySlug)]).toEqual(["core"]);
  });

  it("site is surface-free (no db/admin/mcp/commerce) and managed-site keeps mcp (owner decisions 2026-07-15)", () => {
    const site = resolveModuleSet(getProfile("site")!.modules, bySlug);
    for (const banned of ["db", "auth", "admin", "webshop", "mcp", "acp", "a2a", "ucp"]) {
      expect(site.has(banned), `site must not include ${banned}`).toBe(false);
    }
    const managed = resolveModuleSet(getProfile("managed-site")!.modules, bySlug);
    expect(managed.has("mcp")).toBe(true);
    expect(managed.has("webshop")).toBe(false);
  });

  it("legacy aliases resolve permanently: light → managed-site, full → agentic", () => {
    expect(getProfile("light")!.name).toBe("managed-site");
    expect(getProfile("full")!.name).toBe("agentic");
  });

  it("resolveModuleSet throws on an unknown slug", () => {
    expect(() => resolveModuleSet(["nope"], bySlug)).toThrow(/Unknown module/);
  });
});
