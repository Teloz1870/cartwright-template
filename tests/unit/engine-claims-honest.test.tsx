import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { brand } from "@/brand.config";
import { FEATURE_MANIFEST } from "@/lib/feature-flags/manifest";
import { formatPriceDkk } from "@/lib/format";

/**
 * The engine's own feature surfaces claim only what the code does
 * (SHIP0-a, PASSKEY-CLAIM, DRØM48-c, SKILL-INTERPOLATE).
 *
 * Each rule derives the truth from the source tree instead of pinning copy, so
 * it flips by itself the day the missing code lands:
 *
 *  - Shipping zones. The manifest's `implemented` must equal "production code
 *    calls the zone resolver". Today nothing does — cart, checkout and order
 *    creation price shipping through lib/pricing.calcShipping, the flat rate —
 *    so the flag reads implemented: false, which keeps it off
 *    /built-with-cartwright and llms.txt and puts the flat-rate notice on
 *    /admin/shipping. When SHIP0-b wires zones in, this fails until the
 *    manifest says so (and the other way round).
 *  - Passkeys. No WebAuthn implementation exists (no @simplewebauthn package,
 *    no navigator.credentials ceremony), so no claim surface may mention one.
 *    GAP8 (@simplewebauthn/server) lifts the rule automatically.
 *  - Model ids. Marketing copy says what a feature does for the merchant, not
 *    which model version does it, so a model swap can't make the page wrong.
 *  - Agent rules files. AGENTS.md, its sibling rules files and the project
 *    skills ship into every scaffold, and an AI agent takes them as the
 *    engine's description of itself — so they name passkeys only once WebAuthn
 *    exists, and `interpolate-size` / `calc-size()` only once a stylesheet
 *    uses them (none ever has).
 *
 * Scaffold-safe: it walks the disk (no git) and treats an absent surface as
 * making no claim — /built-with-cartwright is engine-only, and lib/shipping
 * and lib/pricing belong to the webshop module.
 */

const ROOT = process.cwd();
const has = (rel: string) => existsSync(join(ROOT, rel));
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/**
 * What a request can execute, comments stripped (a comment naming the resolver
 * calls nothing). Generated clients, tests and scripts are not production.
 */
const PRODUCTION_DIRS = ["app", "lib", "components", "plugins", "designs", "modules"];
const SKIP_DIRS = new Set(["node_modules", "generated", ".next"]);
const SOURCE_FILE = /\.(?:ts|tsx|js|jsx|mjs)$/;

function walkSources(dirs: string[], file: RegExp): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (file.test(entry.name)) found.set(rel, stripComments(read(rel)));
    }
  };
  for (const dir of dirs) if (has(dir)) walk(dir);
  return found;
}

let sources: Map<string, string> | null = null;
function productionSources(): Map<string, string> {
  return (sources ??= walkSources(PRODUCTION_DIRS, SOURCE_FILE));
}

/** Whole-line `//` comments and block comments say nothing to a customer. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const ZONES_MODULE = "lib/shipping/zones.ts";

/** Production files outside the resolver itself that reach it. */
function zonePricingCallers(): string[] {
  return [...productionSources()]
    .filter(([rel, text]) => rel !== ZONES_MODULE && /\bresolveShipping\b/.test(text))
    .map(([rel]) => rel);
}

function webauthnImplemented(): boolean {
  const pkg = JSON.parse(read("package.json")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  if (deps.some((d) => d.startsWith("@simplewebauthn/") || /webauthn/i.test(d))) return true;
  return [...productionSources().values()].some((text) =>
    /navigator\.credentials\.(?:create|get)\s*\(|\bPublicKeyCredential\b/.test(text),
  );
}

const PASSKEY_CLAIM = /passkey|webauthn/i;
/** gemini-2.5-flash-image, gpt-4o, claude-opus-4-5, imagen-3, dall-e-3 … */
const MODEL_ID = /\b(?:gemini|gpt|claude|imagen|dall-e|llama|mistral)(?:-[a-z]+)*-\d/i;

const manifestCopy = FEATURE_MANIFEST.map((f) => ({
  key: f.key,
  text: `${f.label}\n${f.description}`,
}));

const shippingZones = FEATURE_MANIFEST.find((f) => f.key === "shippingZones");

/** The sentence around a match, so a red run names the claim, not the whole file. */
const around = (text: string, pattern: RegExp) => {
  const m = pattern.exec(text);
  return m ? text.slice(Math.max(0, m.index - 80), m.index + 80) : null;
};

afterEach(() => {
  vi.doUnmock("@/lib/feature-flags/status");
  vi.doUnmock("@/lib/feature-flags/manifest");
  vi.doUnmock("@/app/admin/shipping/actions");
  vi.resetModules();
});

describe("shipping zones — the manifest claims what checkout charges", () => {
  it("implemented is true exactly when production code calls the zone resolver", () => {
    if (!shippingZones) return; // flag removed: nothing left to claim
    const callers = zonePricingCallers();
    const wired = callers.length > 0;
    expect(
      shippingZones.implemented,
      wired
        ? `resolveShipping now has production callers (${callers.join(", ")}). If checkout ` +
            "charges zone rates, set shippingZones.implemented: true in " +
            "lib/feature-flags/manifest.ts and write the description and the " +
            "/built-with-cartwright card for what it now does."
        : "Nothing in production calls resolveShipping — every order pays the flat rate " +
            "(lib/pricing.calcShipping) — so shippingZones must stay implemented: false.",
    ).toBe(wired);
  });

  it("while zones are not charged, the description says the flat rate is", () => {
    if (!shippingZones || zonePricingCallers().length > 0) return;
    expect(shippingZones.description).toMatch(/flat[- ]rate/i);
  });
});

describe("no passkey claim until a WebAuthn implementation exists", () => {
  it("the manifest copy does not mention passkeys", () => {
    if (webauthnImplemented()) return;
    for (const { key, text } of manifestCopy) {
      expect(text, `manifest entry ${key}`).not.toMatch(PASSKEY_CLAIM);
    }
  });

  it("llms.txt and the translation catalogues do not mention passkeys", () => {
    if (webauthnImplemented()) return;
    const surfaces = [
      "app/llms.txt/route.ts",
      "app/llms.txt/route.static.ts",
      "app/[locale]/llms.txt/route.ts",
      ...(has("messages") ? readdirSync(join(ROOT, "messages")).map((f) => `messages/${f}`) : []),
      ...(has("public")
        ? readdirSync(join(ROOT, "public"))
            .filter((f) => /^llms/i.test(f))
            .map((f) => `public/${f}`)
        : []),
    ].filter(has);
    for (const rel of surfaces) {
      expect(stripComments(read(rel)), rel).not.toMatch(PASSKEY_CLAIM);
    }
  });
});

/**
 * AGENTS.md → "Agent rules files", AGENTS.md itself, and every project skill.
 * An absent file makes no claim.
 */
function agentRulesFiles(): string[] {
  const skills = has(".claude/skills")
    ? readdirSync(join(ROOT, ".claude/skills"), { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => `.claude/skills/${e.name}/SKILL.md`)
    : [];
  return [
    "AGENTS.md",
    ".claude/CLAUDE.md",
    ".cursor/rules/cartwright.mdc",
    ".github/copilot-instructions.md",
    "GEMINI.md",
    ".windsurfrules",
    ...skills,
  ].filter(has);
}

/** CSS a rules file may name only while the engine's own styles use it. */
const CSS_FEATURES = [
  { name: "interpolate-size", claim: /interpolate-size/i, use: /\binterpolate-size\s*:|\binterpolateSize\s*:/ },
  { name: "calc-size()", claim: /calc-size/i, use: /\bcalc-size\s*\(/ },
];

/** Stylesheets plus production sources (CSS-in-template-strings, style objects). */
function cssInUse(use: RegExp): boolean {
  const sheets = walkSources([...PRODUCTION_DIRS, "themes", "styles"], /\.css$/);
  return [...sheets.values(), ...productionSources().values()].some((text) => use.test(text));
}

describe("the agent rules files name only engine features that exist", () => {
  it("no rules file mentions passkeys while there is no WebAuthn implementation", () => {
    const files = agentRulesFiles();
    expect(files.length).toBeGreaterThan(0); // every scaffold ships AGENTS.md
    if (webauthnImplemented()) return;
    for (const rel of files) {
      expect(around(read(rel), PASSKEY_CLAIM), rel).toBeNull();
    }
  });

  it.each(CSS_FEATURES)("no rules file names $name unless a stylesheet uses it", ({ claim, use }) => {
    if (cssInUse(use)) return;
    for (const rel of agentRulesFiles()) {
      expect(around(read(rel), claim), rel).toBeNull();
    }
  });
});

describe("marketing copy names what a feature does, not which model does it", () => {
  it("no manifest label or description carries a model id", () => {
    for (const { key, text } of manifestCopy) {
      expect(text, `manifest entry ${key}`).not.toMatch(MODEL_ID);
    }
  });
});

const BWC_PAGE = "app/[locale]/built-with-cartwright/page.tsx";

describe.runIf(has(BWC_PAGE))("/built-with-cartwright renders only true claims", () => {
  /** Every flag on, so every card and every proof link the page can show is rendered. */
  async function renderTour(): Promise<string> {
    vi.doMock("@/lib/feature-flags/status", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/feature-flags/status")>();
      const allOn = Object.fromEntries(FEATURE_MANIFEST.map((f) => [f.key, true]));
      const merged = {
        ...brand,
        source: "fallback",
        ecommerceEnabled: true,
        features: { ...brand.features, ...allOn },
        logo: { ...brand.logo, imageUrl: null },
      } as unknown as Parameters<typeof actual.computeFeatureStatuses>[0];
      return {
        ...actual,
        getFeatureView: async () => ({
          features: actual.computeFeatureStatuses(merged),
          identity: [],
        }),
      };
    });
    const { default: Page } = await import("@/app/[locale]/built-with-cartwright/page");
    return renderToStaticMarkup((await Page()) as ReactElement);
  }

  it("names no passkeys, no model ids, and no unwired shipping zones", async () => {
    const html = await renderTour();
    expect(html).toContain("Built with Cartwright"); // the page really rendered
    if (!webauthnImplemented()) {
      expect(around(html, PASSKEY_CLAIM), "passkey claim without WebAuthn").toBeNull();
    }
    expect(around(html, MODEL_ID), "model id in marketing copy").toBeNull();
    if (shippingZones && zonePricingCallers().length === 0) {
      const label = new RegExp(shippingZones.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      expect(around(html, label), "shipping-zones card while checkout charges the flat rate").toBeNull();
    }
  });
});

const SHIPPING_ADMIN = "app/admin/shipping/page.tsx";

describe.runIf(has(SHIPPING_ADMIN))("/admin/shipping tells the merchant what checkout charges", () => {
  async function renderAdmin(): Promise<string> {
    vi.doMock("@/app/admin/shipping/actions", () => ({
      listZones: async () => [],
      createZone: async () => ({ ok: true }),
      deleteZone: async () => ({ ok: true }),
      createRate: async () => ({ ok: true }),
      deleteRate: async () => ({ ok: true }),
    }));
    const { default: Page } = await import("@/app/admin/shipping/page");
    return renderToStaticMarkup((await Page()) as ReactElement);
  }

  it("shows the flat-rate notice, with the fee checkout charges, while zones are not charged", async () => {
    const html = await renderAdmin();
    const notice = /<div role="note"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "";
    if (shippingZones?.implemented) {
      expect(notice).toBe("");
      return;
    }
    expect(notice).toMatch(/flat rate/i);
    expect(notice).toContain(formatPriceDkk(brand.policies.shippingDefaultDkk));
    expect(notice).toContain(formatPriceDkk(brand.policies.shippingFreeThresholdDkk));
  });

  it("drops the notice once the manifest says zones are charged", async () => {
    vi.doMock("@/lib/feature-flags/manifest", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/feature-flags/manifest")>();
      return {
        ...actual,
        getDescriptor: (key: Parameters<typeof actual.getDescriptor>[0]) => {
          const d = actual.getDescriptor(key);
          return d && key === "shippingZones" ? { ...d, implemented: true } : d;
        },
      };
    });
    const html = await renderAdmin();
    expect(html).toMatch(/<h1[^>]*>/); // the page really rendered
    expect(html).not.toContain('role="note"');
  });
});
