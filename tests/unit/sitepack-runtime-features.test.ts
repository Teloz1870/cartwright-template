import { beforeEach, describe, expect, it, vi } from "vitest";

// What the two sitepack tools RECORD about the site's flags: the export
// manifest's `featuresRequested` and the import plan's "Required feature X is
// not enabled" warnings. Both must follow the RUNTIME view (brand.config default
// merged with the /admin/features override) the tools gate on — not
// brand.config's compile-time defaults — and refuse when that view is unreadable.
//
// brand.config's flags are pinned by this file (filled below), so it passes in
// a scaffold whose own brand.config has none — or all — of the runtime flags on.
// Every other brand field stays real.
const config = vi.hoisted(() => ({}) as Record<string, boolean>);
vi.mock("@/brand.config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/brand.config")>();
  Object.assign(config, actual.brand.features);
  return { ...actual, brand: { ...actual.brand, features: config } };
});
vi.mock("@/lib/db", () => {
  const none = () => vi.fn(async () => []);
  return {
    prisma: {
      page: { findMany: none() },
      category: { findMany: none() },
      service: { findMany: none() },
      post: { findMany: none() },
      product: { findMany: none() },
      productVariant: { findMany: none() },
      productMedia: { findMany: none() },
      mediaAsset: { findMany: none() },
      brandingSettings: { findFirst: vi.fn(async () => null) },
      integrationSettings: { findFirst: vi.fn(async () => null) },
    },
  };
});
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));
vi.mock("@/lib/compositions/apply", () => ({ applyComposition: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/compositions/export", () => ({
  exportComposition: vi.fn(async () => ({ schema: "cartwright-composition-v1", name: "Site", skin: "aurora-site" })),
}));
vi.mock("@/lib/media/asset", () => ({ findOrCreateBySha256: vi.fn(), computeSha256: vi.fn() }));
vi.mock("@/lib/plugins/install", () => ({ getPluginStates: vi.fn(async () => []) }));
vi.mock("@/designs/options", () => ({ DESIGN_OPTIONS: [{ slug: "aurora-site" }] }));
vi.mock("@/lib/audit", () => ({ withAudit: async (_m: unknown, fn: () => Promise<unknown>) => fn() }));
// Both readers serve getBrand()'s one view, as in production. During a DB outage
// that view is brand.config's defaults, and only the gate state says it is a guess.
const runtime = vi.hoisted(() => ({ available: true, features: {} as Record<string, boolean> }));
vi.mock("@/lib/brand", () => ({
  resolveStoreIdentity: () => ({ designSlug: "aurora-site" }),
  getFeatures: async () => ({ ...runtime.features }),
  getFeatureGateState: async () => ({ available: runtime.available, features: { ...runtime.features } }),
}));

import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";
import { RUNTIME_TOGGLEABLE_KEYS } from "@/lib/feature-flags/manifest";
import { assembleCartpack, type ExportMeta, type GatheredSite } from "@/lib/sitepack/export";
import { openCartpack } from "@/lib/sitepack/import-open";
import { exportSite, importSite } from "@/lib/tools/sitepack";

const ctx = { actor: "user:admin", ip: null, userAgent: null } as never;
const LIMITS = { maxTotalBytes: 10_000_000, maxEntries: 1000, maxEntryBytes: 5_000_000 };

const toggleable = (k: string) => k !== "sitePack" && RUNTIME_TOGGLEABLE_KEYS.has(k as never);
/** Off in brand.config, switched ON in /admin/features — and the reverse. Picked
 *  from the manifest, so the pair never depends on the shipped brand.config. */
const [switchedOn, switchedOff] = [...RUNTIME_TOGGLEABLE_KEYS].filter(toggleable).sort();
// The pinned brand.config: sitePack off as shipped, every runtime flag off but one.
config.sitePack = false;
for (const k of RUNTIME_TOGGLEABLE_KEYS) if (toggleable(k)) config[k] = k === switchedOff;
/** The admin's runtime view: every flag /admin/features can change flipped from
 *  its brand.config default, sitePack held on so the tools' gate opens. */
function flippedView(): Record<string, boolean> {
  const view = Object.fromEntries(Object.entries(config).map(([k, v]) => [k, toggleable(k) ? !v : v]));
  view.sitePack = true;
  return view;
}
const onIn = (view: Record<string, boolean>) => Object.keys(view).filter((k) => view[k]).sort();

/** A minimal, valid pack for this site's mode that requires `featuresRequired`. */
function packRequiring(featuresRequired: string[]): string {
  const site: GatheredSite = {
    pages: [],
    categories: [],
    services: [],
    posts: [],
    products: [],
    variants: [],
    productMedia: [],
    media: [],
    branding: {},
    integration: {},
    compositionJson: JSON.stringify({ schema: "cartwright-composition-v1", name: "Pack", skin: "aurora-site" }),
  };
  const meta: ExportMeta = {
    id: "sp-runtime-flags",
    name: "Pack",
    createdAt: "2026-10-24T00:00:00Z",
    exporter: { version: "0.0.0-source", channel: "source" },
    mode: brand.mode,
    defaultLocale: brand.defaultLocale,
    locales: [...brand.locales],
    designRef: { slug: "aurora-site", kind: "data" },
    featuresRequired,
  };
  return assembleCartpack(site, meta).toString("base64");
}

beforeEach(() => {
  vi.clearAllMocks();
  runtime.available = true;
  runtime.features = flippedView();
});

describe("sitepack tools record the RUNTIME flag view, not brand.config", () => {
  it("the tools see the pinned brand.config: one runtime flag off, one on (else the cases below prove nothing)", () => {
    expect(switchedOn).toBeDefined();
    expect(switchedOff).toBeDefined();
    expect(brand.features).toMatchObject({ [switchedOn]: false, [switchedOff]: true, sitePack: false });
  });

  it("export: featuresRequested lists the flags the site runs with", async () => {
    const out = await exportSite.handler({ confirm: true }, ctx);
    const { manifest } = openCartpack(Buffer.from(out.cartpackBase64, "base64"), LIMITS);
    expect([...manifest.featuresRequested].sort()).toEqual(onIn(runtime.features));
    expect(manifest.featuresRequested).toContain(switchedOn); // under-reported when read from brand.config
    expect(manifest.featuresRequested).not.toContain(switchedOff);
  });

  it("import preview: a flag switched on in /admin/features satisfies the pack; one switched off does not", async () => {
    const res = await importSite.handler({ cartpackBase64: packRequiring([switchedOn, switchedOff]), dryRun: true }, ctx);
    const { warnings } = (res as { plan: { warnings: string[] } }).plan;
    expect(warnings).not.toContain(`Required feature "${switchedOn}" is not enabled.`); // the false warning
    expect(warnings).toContain(`Required feature "${switchedOff}" is not enabled.`);
  });

  it("import apply: the restore's warnings and its undo snapshot follow the same runtime view", async () => {
    const res = await importSite.handler({ cartpackBase64: packRequiring([switchedOn, switchedOff]), confirm: true }, ctx);
    const out = res as { ok: boolean; warnings: string[]; snapshotBase64: string };
    expect(out).toMatchObject({ ok: true }); // else `error` says why the restore stopped
    expect(out.warnings).not.toContain(`Required feature "${switchedOn}" is not enabled.`); // runImport's plan
    expect(out.warnings).toContain(`Required feature "${switchedOff}" is not enabled.`);
    // The undo pack, taken before any write, records what the site ran with.
    const { manifest } = openCartpack(Buffer.from(out.snapshotBase64, "base64"), LIMITS);
    expect([...manifest.featuresRequested].sort()).toEqual(onIn(runtime.features));
  });

  it("fails closed when the view could not be read: both tools refuse before reading the site", async () => {
    // The outage view is brand.config's defaults — here with sitePack on, which
    // the admin may have switched off. Neither the gate nor the recorded flag
    // list may stand on it.
    runtime.available = false;
    runtime.features = { ...config, sitePack: true };
    await expect(exportSite.handler({ confirm: true }, ctx)).rejects.toThrow(/unavailable/i);
    await expect(importSite.handler({ cartpackBase64: packRequiring([]), dryRun: true }, ctx)).rejects.toThrow(/unavailable/i);
    expect(vi.mocked(prisma.page.findMany)).not.toHaveBeenCalled();
  });
});
