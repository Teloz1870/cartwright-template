/**
 * cartwright-plugin-v1 — the installable-module contract for Cartwright Light.
 *
 * A plugin is an optional engine module (flag + files + routes + admin surface
 * + optional Prisma fragment) that the light scaffold can prune and
 * `npx cartwright add <slug>` can re-install. v1 plugins are IN-REPO: the
 * engine repo is the source of truth for every plugin's files, and
 * `plugins/registry.ts` is the catalogue. "Install" therefore means
 * include-or-prune (profile mechanics) — not fetching code at runtime.
 *
 * Lineage: this schema extends the parked Phase-1 plugin-foundation spec
 * (branch `docs/plugin-foundation-spec`) per the core-audit decision
 * (internal-docs/core-audit.md §2, open question 8): the spec's reserved
 * `admin`/`database` forward-fields are realised here as `adminNav` +
 * `prismaFragment`, and `routeMounts` is added because most audited plugins
 * ship route handlers, not just storefront slot components. Carried over
 * verbatim from the parked spec: schema-version literal, semver-validated
 * `version`, safe-relative-path rules (no `..`, no absolute, no URL) and
 * forward-compatible loose parsing (unknown fields accepted silently).
 *
 * Sibling of lib/designs/spec.ts (cartwright-design-v1) and
 * lib/compositions/spec.ts (cartwright-composition-v1): a Zod schema with a
 * `schema` literal version string. CLIENT-SAFE — no `server-only` imports, so
 * the marketplace-manifest generator and the drift test can import it.
 */
import { z } from "zod";

export const PLUGIN_SCHEMA_ID = "cartwright-plugin-v1" as const;

// ── Building blocks ─────────────────────────────────────────────────────────

/**
 * A repo-relative file path that can never escape the project root.
 * Mirrors the parked spec's safe-path rules: relative, no `..` segments,
 * no URLs, no backslashes (one canonical separator).
 */
export const safeRepoPath = z
  .string()
  .min(1)
  .refine((s) => !s.startsWith("/"), { message: "must not be absolute" })
  .refine((s) => !/^[a-z][a-z0-9+.-]*:/i.test(s), { message: "must not be a URL" })
  .refine((s) => !s.includes("\\"), { message: "must use forward slashes" })
  .refine((s) => !s.split("/").some((seg) => seg === ".." || seg === ""), {
    message: "must not contain '..' or empty segments",
  });

/** Strict `major.minor.patch` (optional pre-release/build) — no semver dep needed. */
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;

export const PluginFileSchema = z
  .object({
    /** Where the file lives in a scaffold (repo-relative). */
    path: safeRepoPath,
    /**
     * Inline file contents — the registry-served install path (shadcn-style).
     * Omitted for in-repo v1 plugins, where the file on disk IS the truth.
     */
    contents: z.string().optional(),
    /**
     * Reference into a served registry (the svg-items precedent) — reserved
     * for the `cartwright add` CLI follow-up. Mutually exclusive with
     * `contents`.
     */
    registryRef: z.string().min(1).optional(),
  })
  .refine((f) => !(f.contents !== undefined && f.registryRef !== undefined), {
    message: "a file may carry `contents` OR `registryRef`, not both",
  });

/**
 * A route mount: a thin file at a Next.js-routed path (`app/**`) that
 * re-exports its handlers/page from the plugin's self-contained module.
 * The mount file is what the scaffold prunes/re-creates; the implementation
 * lives under `plugins/<slug>/`.
 */
export const RouteMountSchema = z.object({
  /** The Next.js-routed file, e.g. `app/api/phone/webhook/route.ts`. */
  mount: safeRepoPath.refine((s) => s.startsWith("app/"), {
    message: "mounts must live under app/",
  }),
  /** The plugin-owned implementation module the mount re-exports from. */
  from: safeRepoPath.refine((s) => s.startsWith("plugins/"), {
    message: "implementations must live under plugins/",
  }),
  /** Named exports the mount forwards (`default` for pages). */
  exports: z.array(z.string().min(1)).min(1),
});

export const AdminNavEntrySchema = z.object({
  href: z.string().startsWith("/admin"),
  label: z.string().min(1),
});

export const PluginDepSchema = z.object({
  /** npm package name the plugin needs (light drops it; install adds it). */
  name: z.string().min(1),
  /** Semver range, package.json style. */
  version: z.string().min(1).optional(),
});

// ── The manifest ────────────────────────────────────────────────────────────

/**
 * Forward-compatible by design (parked-spec invariant): `z.looseObject`
 * accepts unknown future fields silently, so a v1 engine can read manifests
 * authored against later contract minors.
 */
export const PluginManifestSchema = z.looseObject({
  schema: z.literal(PLUGIN_SCHEMA_ID),
  /** Catalogue id — also the directory name under `plugins/`. */
  slug: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, {
    message: "slug must be kebab-case",
  }),
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.string().regex(SEMVER_RE, { message: "must be a valid semver version" }),
  /** The brand.features key that gates the plugin at runtime. */
  flag: z.string().min(1),
  /** Every file the plugin owns (implementation + mounts + shims). */
  files: z.array(PluginFileSchema).min(1),
  /**
   * Prisma schema fragment (models/columns) the plugin needs. v1 is honest:
   * the engine does NOT apply schema changes — install surfaces this as a
   * "run pnpm db:push" note. Omit when the plugin needs no schema.
   */
  prismaFragment: z.string().min(1).optional(),
  routeMounts: z.array(RouteMountSchema).optional(),
  /** Admin nav entries the plugin contributes (informational in v1 — the
   *  engine's lib/admin/nav.ts still owns the rendered nav). */
  adminNav: z.array(AdminNavEntrySchema).optional(),
  /** Extra npm deps beyond the light scaffold's baseline. */
  deps: z.array(PluginDepSchema).optional(),
});

export type CartwrightPluginManifest = z.infer<typeof PluginManifestSchema>;
export type CartwrightPluginFile = z.infer<typeof PluginFileSchema>;
export type CartwrightPluginRouteMount = z.infer<typeof RouteMountSchema>;

/** Parse + validate a manifest, with a readable error message on failure. */
export function parsePluginManifest(input: unknown): CartwrightPluginManifest {
  const result = PluginManifestSchema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path?.length ? ` at ${first.path.join(".")}` : "";
    throw new Error(`Invalid cartwright-plugin-v1 manifest${where}: ${first?.message}`);
  }
  return result.data;
}

/** The compact catalogue entry surfaces (marketplace manifest, plugin gallery). */
export type PluginCatalogueEntry = {
  slug: string;
  name: string;
  description: string;
  flag: string;
};

export function toCatalogueEntry(m: CartwrightPluginManifest): PluginCatalogueEntry {
  return { slug: m.slug, name: m.name, description: m.description, flag: m.flag };
}
