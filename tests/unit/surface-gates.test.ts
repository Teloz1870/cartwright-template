import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { MODULE_GATES, type ToolGate } from "@/lib/surface/gates";
import { isModuleActive, isVisible, type ShopContext } from "@/lib/surface/visible";
import { FEATURE_MANIFEST } from "@/lib/feature-flags/manifest";
import type { MergedBrand } from "@/lib/brand";
import { MODULES } from "@/modules/registry";
import { PLUGINS } from "@/plugins/registry";
import { listTools } from "@/lib/tools/registry";
import * as commercePacks from "@/lib/tools/packs/commerce";
import { isEngineCheckout, REPO_ROOT, stripComments } from "../helpers/claims";
import { flagReadsByTool, readsFlagsFromConfig, SCHEMA_FLAGS, ungatedReads } from "../helpers/flag-reads";

/**
 * SURF1-a: the data a shop's tool surface will be filtered by. The expected
 * lists are written out by hand from the modules spec (sections 1 and 2), so
 * they cannot move with the code they check.
 *
 * What pins the engine's own modules and tools runs in the engine only, like the
 * pins in tests/unit/scaffold-ownership.test.ts: a light scaffold has no hoptify
 * plugin, and a customer's own plugin or tool must not turn their `pnpm test` red.
 * The engine's own suite runs this file on a checkout shaped like a customer's to
 * keep that true.
 */

// `getBrand()` has to be able to stand in for the context the rule reads.
const brandIsAContext = (merged: MergedBrand): ShopContext => merged;
void brandIsAContext;

const ALWAYS_ACTIVE = [
  "admin",
  "agent-core",
  "auth",
  "contact-form",
  "core",
  "db",
  "google-fonts",
  "mcp",
  "pages-db",
  "trust-pages",
];

const NON_PLUGIN_GATES = {
  webshop: { ecommerce: true },
  feeds: { flags: ["merchantFeed"] },
  acp: { flags: ["acp"] },
  a2a: { flags: ["a2a"] },
  ucp: { flags: ["ucpIdentityLinking"] },
  voice: { flags: ["voiceShop"] },
  "agent-admin": { flags: ["adminAgenticDashboard"] },
};

/** Section 2: the shopper's tools. They take the cookie cart or the session, or render in the chat. */
const STOREFRONT_TOOLS = [
  "address.autocomplete",
  "cart.add",
  "cart.get_summary",
  "cart.remove",
  "cart.update_quantity",
  "discounts.try_apply",
  "orders.create",
  "ui.present_products",
  "user.get_last_shipping",
];

/** The appendix's 14 tools whose code a plugin owns, each with exactly what its gate asks for. */
const PLUGIN_OWNED_TOOLS: Record<string, string[]> = {
  "posts.list": ["blog"],
  "posts.create": ["blog"],
  "posts.update": ["blog"],
  "posts.publish": ["blog"],
  "three.get": ["threeD"],
  "three.configure": ["threeD"],
  "sheets.sync_now": ["sheetsSync"],
  "sheets.pull": ["sheetsSync"],
  "sheets.push": ["sheetsSync"],
  "google.connect_status": ["sheetsSync"],
  "drive.import_folder": ["googleDrive", "mediaLibrary"],
  "drive.backup_now": ["googleDrive"],
  "docs.import": ["docsImport"],
  "design.import_from_url": ["designImport"],
};

/** Section 2's 22 build tools: always registered on a shop, genome's 7 among them. */
const BUILD_TOOLS = [
  "chrome.set",
  "composition.apply",
  "composition.export",
  "design.get_layout",
  "design.set_layout",
  "design.set_slug",
  "features.set",
  "genome.describe_business",
  "genome.get",
  "genome.reharmonize",
  "genome.resolve",
  "genome.set",
  "genome.set_entity_copy",
  "genome.set_identity",
  "magic.compose_look",
  "mockup.clear",
  "mockup.set",
  "pages.get_layout",
  "pages.set_layout",
  "settings.update_branding",
  "settings.update_copy",
  "vertical.apply",
];

/** Build tools a flag also hides: section 2 subtracts these first, so they are outside its 22. */
const FLAGGED_BUILD_TOOLS = [
  "content.import_site",
  "design.import_from_url",
  "magic.generate_page",
  "magic.plan_page",
  "sitepack.export",
  "sitepack.import",
  "three.configure",
  "three.get",
];

/** The tools that read a flag in lib/tools itself. The others that stop on one do it further down. */
const TOOLS_READING_A_FLAG = {
  "content.import_site": ["siteImport"],
  "magic.generate_page": ["magicBuilder"],
  "magic.plan_page": ["magicBuilder"],
  "migration.attest": ["migrationDashboard"],
  "migration.freeze_sitemap": ["migrationDashboard"],
  "migration.project_set": ["migrationDashboard"],
  "migration.run_checks": ["migrationDashboard"],
  "migration.status": ["migrationDashboard"],
  "migration.woo_plan": ["migrationDashboard"],
  "sitepack.export": ["sitePack"],
  "sitepack.import": ["sitePack"],
};

/**
 * Every tool a flag hides, with exactly what its gate asks for. A wrong extra flag
 * would hide a tool from a shop that has its feature on, and the fixture counts
 * cannot see one that all four fixtures have on, or one that moves with the tool's
 * own flag.
 */
const FLAGGED_TOOLS: Record<string, string[]> = {
  ...PLUGIN_OWNED_TOOLS,
  ...TOOLS_READING_A_FLAG,
  // These two read theirs further down, in lib/subscriptions.ts.
  "subscriptions.cancel": ["subscriptions"],
  "subscriptions.list": ["subscriptions"],
};

const sorted = (names: Iterable<string>) => [...names].sort();
const namesWhere = (test: (gate: ToolGate) => unknown) =>
  sorted(listTools().filter((tool) => test(tool.gate ?? {})).map((tool) => tool.name));

const shop = (features: Record<string, boolean> = {}, ecommerceEnabled = true): ShopContext => ({
  ecommerceEnabled,
  features,
});

describe("MODULE_GATES: which modules a shop can have off at runtime", () => {
  it.runIf(isEngineCheckout)("a plugin is gated by its manifest's flag and nothing else", () => {
    expect(PLUGINS.length).toBeGreaterThan(0);
    for (const plugin of PLUGINS) {
      expect(MODULE_GATES[plugin.slug], plugin.slug).toEqual({ flags: [plugin.flag] });
    }
  });

  it("the other modules are gated as section 1 lists them", () => {
    for (const [slug, gate] of Object.entries(NON_PLUGIN_GATES)) {
      expect(MODULE_GATES[slug], slug).toEqual(gate);
    }
  });

  it.runIf(isEngineCheckout)("the table and the module graph hold the same slugs", () => {
    const modules = MODULES.map((m) => m.slug);
    expect(Object.keys(MODULE_GATES).filter((slug) => !modules.includes(slug))).toEqual([]);
    // A new module has to say which it is: gated here, or always active.
    expect(sorted(modules.filter((slug) => !(slug in MODULE_GATES)))).toEqual(ALWAYS_ACTIVE);
    expect(sorted(Object.keys(MODULE_GATES))).toEqual(
      sorted([...Object.keys(NON_PLUGIN_GATES), ...PLUGINS.map((p) => p.slug)]),
    );
  });

  it("every flag a gate names is a real flag", () => {
    const known = new Set<string>(FEATURE_MANIFEST.map((f) => f.key));
    const named = [
      ...Object.values(MODULE_GATES).flatMap((gate) => gate.flags ?? []),
      ...listTools().flatMap((tool) => tool.gate?.flags ?? []),
    ];
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((flag) => !known.has(flag))).toEqual([]);
  });

  it("the runtime never reads the module graph: lib/surface imports only itself and a type", () => {
    const dir = path.join(REPO_ROOT, "lib", "surface");
    const files = readdirSync(dir);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = stripComments(readFileSync(path.join(dir, file), "utf8"));
      const imports = [...source.matchAll(/^import\s+(type\s+)?[^;]*?from\s+"([^"]+)"/gm)];
      for (const [, typeOnly, from] of imports) {
        const allowed = from.startsWith("@/lib/surface/") || (typeOnly && from === "@/lib/feature-flags/manifest");
        expect(allowed, `${file} imports ${from}`).toBeTruthy();
      }
    }
  });
});

describe("isModuleActive", () => {
  it("reads identity for the webshop and flags for the rest", () => {
    expect(isModuleActive("webshop", shop({}, true))).toBe(true);
    expect(isModuleActive("webshop", shop({ webshop: true }, false))).toBe(false);
    expect(isModuleActive("feeds", shop({ merchantFeed: true }))).toBe(true);
    expect(isModuleActive("feeds", shop({ merchantFeed: false }))).toBe(false);
    expect(isModuleActive("blog", shop({ blog: true }, false))).toBe(true);
    expect(isModuleActive("blog", shop({}))).toBe(false);
  });

  it("a slug with no gate is always active", () => {
    for (const slug of ALWAYS_ACTIVE) expect(isModuleActive(slug, shop({}, false)), slug).toBe(true);
  });
});

describe("isVisible", () => {
  it("a tool with no gate is there for every shop and for an operate caller", () => {
    expect(isVisible({}, shop({}, false))).toBe(true);
    expect(isVisible({}, shop({}, false), { surface: "operate" })).toBe(true);
    expect(isVisible({ gate: {} }, shop({}, false), {})).toBe(true);
  });

  it("every flag has to be on, and a flag the shop does not know is off", () => {
    const tool = { gate: { flags: ["googleDrive", "mediaLibrary"] as const } };
    expect(isVisible(tool, shop({ googleDrive: true, mediaLibrary: true }))).toBe(true);
    expect(isVisible(tool, shop({ googleDrive: true, mediaLibrary: false }))).toBe(false);
    expect(isVisible(tool, shop({ googleDrive: false, mediaLibrary: true }))).toBe(false);
    expect(isVisible(tool, shop({ mediaLibrary: true }))).toBe(false);
  });

  it("an ecommerce gate reads ecommerceEnabled, not the webshop flag", () => {
    const tool = { gate: { ecommerce: true } };
    expect(isVisible(tool, shop({}, true))).toBe(true);
    expect(isVisible(tool, shop({ webshop: true }, false))).toBe(false);
  });

  it("identity and flags have to hold together", () => {
    const tool = { gate: { ecommerce: true, flags: ["subscriptions"] as const } };
    expect(isVisible(tool, shop({ subscriptions: true }, true))).toBe(true);
    expect(isVisible(tool, shop({ subscriptions: true }, false))).toBe(false);
    expect(isVisible(tool, shop({ subscriptions: false }, true))).toBe(false);
  });

  it("a storefront tool is never on an agent surface, whoever asks", () => {
    const tool = { gate: { surface: "storefront" as const } };
    expect(isVisible(tool, shop())).toBe(false);
    expect(isVisible(tool, shop(), {})).toBe(false);
    expect(isVisible(tool, shop(), { surface: "operate" })).toBe(false);
    expect(isVisible(tool, shop(), { surface: "build" })).toBe(false);
  });

  it("a caller with a class sees that class; one without sees both", () => {
    const operate = { gate: { surface: "operate" as const } };
    const build = { gate: { surface: "build" as const } };
    expect(isVisible(operate, shop())).toBe(true);
    expect(isVisible(build, shop())).toBe(true);
    expect(isVisible(build, shop(), {})).toBe(true);
    expect(isVisible(operate, shop(), { surface: "operate" })).toBe(true);
    expect(isVisible(build, shop(), { surface: "operate" })).toBe(false);
    expect(isVisible(build, shop(), { surface: "build" })).toBe(true);
    expect(isVisible(operate, shop(), { surface: "build" })).toBe(false);
  });

  it("a caller can only narrow what the shop shows", () => {
    const off = shop({}, false);
    const on = shop(Object.fromEntries(FEATURE_MANIFEST.map((f) => [f.key, true])));
    for (const tool of listTools()) {
      for (const context of [off, on]) {
        for (const surface of ["operate", "build"] as const) {
          if (isVisible(tool, context, { surface })) {
            expect(isVisible(tool, context), tool.name).toBe(true);
          }
        }
      }
    }
  });
});

describe("ToolDefinition.gate: the field on the tools", () => {
  it.runIf(isEngineCheckout)("the 9 storefront tools of section 2", () => {
    expect(namesWhere((gate) => gate.surface === "storefront")).toEqual(STOREFRONT_TOOLS);
  });

  it.runIf(isEngineCheckout)("the 27 tools with a flag, the 14 plugin-owned among them, each asking for exactly these", () => {
    expect(Object.keys(PLUGIN_OWNED_TOOLS)).toHaveLength(14);
    expect(Object.keys(FLAGGED_TOOLS)).toHaveLength(27);
    const flagged = listTools().filter((tool) => tool.gate?.flags);
    expect(Object.fromEntries(flagged.map((tool) => [tool.name, tool.gate?.flags]))).toEqual(FLAGGED_TOOLS);
  });

  it.runIf(isEngineCheckout)("the 22 build tools of section 2, and the flagged build tools it subtracts first", () => {
    expect(BUILD_TOOLS).toHaveLength(22);
    expect(BUILD_TOOLS.filter((name) => name.startsWith("genome."))).toHaveLength(7);
    expect(namesWhere((gate) => gate.surface === "build" && !gate.flags)).toEqual(BUILD_TOOLS);
    expect(namesWhere((gate) => gate.surface === "build" && gate.flags)).toEqual(FLAGGED_BUILD_TOOLS);
  });

  it.runIf(isEngineCheckout)("an ecommerce gate sits on exactly the tools of the commerce packs", () => {
    const packs = Object.values(commercePacks).filter((value) => Array.isArray(value)) as { name: string }[][];
    expect(packs.length).toBeGreaterThan(0);
    expect(namesWhere((gate) => gate.ecommerce)).toEqual(sorted(packs.flat().map((tool) => tool.name)));
  });
});

describe("a tool's own flag reads", () => {
  const toolDir = path.join(REPO_ROOT, "lib", "tools");
  const toolFiles = readdirSync(toolDir)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => ({ file, source: readFileSync(path.join(toolDir, file), "utf8") }));

  it.runIf(isEngineCheckout)("no tool reads a flag from brand.config: /admin/features could never reach it", () => {
    expect(toolFiles.length).toBeGreaterThan(0);
    const withoutSchemaFlags = (source: string) =>
      [...SCHEMA_FLAGS].reduce((text, flag) => text.replaceAll(`brand.features.${flag}`, "false"), source);
    expect(toolFiles.filter(({ source }) => readsFlagsFromConfig(withoutSchemaFlags(source))).map(({ file }) => file)).toEqual([]);
  });

  it.runIf(isEngineCheckout)("a flag a tool reads is in that tool's own gate", () => {
    const { byTool, unreached } = flagReadsByTool(toolFiles);
    // Every registered tool was read: one defined some other way would go unchecked.
    expect(sorted(byTool.keys())).toEqual(sorted(listTools().map((tool) => tool.name)));
    expect(unreached).toEqual([]);
    expect(ungatedReads(byTool, listTools())).toEqual([]);
    expect(Object.fromEntries([...byTool].filter(([, flags]) => flags.length > 0))).toEqual(TOOLS_READING_A_FLAG);
  });
});

describe("the reader those two pins stand on", () => {
  const OFF = 'throw new Error("off");';
  const tool = (name: string, body: string, gate = "") =>
    `export const t = defineTool({ name: "${name}", ${gate} handler: async (args) => { ${body} } });`;
  const reads = (...sources: string[]) => {
    const files = sources.map((source, index) => ({ file: `file${index}.ts`, source }));
    return Object.fromEntries(flagReadsByTool(files).byTool);
  };

  it.each([
    ["a bare name", `const features = await getFeatures(); if (!features.blog) ${OFF}`],
    ["off the merged brand", `const brand = await getBrand(); if (!brand.features.blog) ${OFF}`],
    ["off the gate state", `const state = await getFeatureGateState(); if (!state.features.blog) ${OFF}`],
    ["the gate state taken apart", `const { available, features } = await getFeatureGateState(); if (!available || !features.blog) ${OFF}`],
    ["right off the call", `if (!(await getFeatures()).blog) ${OFF}`],
    ["right off getBrand", `if (!(await getBrand()).features.blog) ${OFF}`],
    ["destructured", `const { blog } = await getFeatures(); if (!blog) ${OFF}`],
    ["destructured under another name", `const { blog: on } = await getFeatures(); if (!on) ${OFF}`],
    ["destructured out of the brand", `const { features: { blog } } = await getBrand(); if (!blog) ${OFF}`],
    ["destructured off brand.features", `const brand = await getBrand(); const { blog } = brand.features; if (!blog) ${OFF}`],
    ["the flags under another name", `const flags = await getFeatures(); if (!flags.blog) ${OFF}`],
    ["the brand's flags under another name", `const { features: flags } = await getBrand(); if (!flags.blog) ${OFF}`],
    ["through a cast", `const brand = await getBrand(); if (!(brand.features as { blog?: boolean }).blog) ${OFF}`],
    ["through an old-style cast", `const brand = await getBrand(); if (!(<{ blog?: boolean }>brand.features).blog) ${OFF}`],
    ["through satisfies", `const brand = await getBrand(); if (!(brand.features satisfies object).blog) ${OFF}`],
    ["past a non-null assertion", `const brand = await getBrand(); if (!brand.features!.blog) ${OFF}`],
    ["by a string key", `const features = await getFeatures(); if (!features["blog"]) ${OFF}`],
    ["the flags by a string key", `const brand = await getBrand(); if (!brand["features"].blog) ${OFF}`],
    ["over an optional chain", `const brand = await getBrand(); if (!brand.features?.blog) ${OFF}`],
    ["inside a callback", `return withAudit({}, async () => { const features = await getFeatures(); if (!features.blog) ${OFF} });`],
    ["in a closure above the name", `const isOn = () => flags.blog; const flags = await getFeatures(); if (!isOn()) ${OFF}`],
  ])("reads a flag: %s", (_form, body) => {
    expect(reads(tool("a.one", body))).toEqual({ "a.one": ["blog"] });
  });

  it("reads every flag a destructure takes, sorted", () => {
    expect(reads(tool("a.one", "const { reviews, blog } = await getFeatures(); return blog && reviews;"))).toEqual({ "a.one": ["blog", "reviews"] });
  });

  it.each([
    ["a string", 'return { note: "features.blog" };'],
    ["a comment", "// features.blog\n return {};"],
    ["a gate", "return {};"],
    ["the whole object by no name", "const features = await getFeatures(); return Object.keys(features);"],
    ["the same name off something else", "const brand = await getBrand(); return brand.blog;"],
    ["a field of the tool's own input", "return { bullets: args.features.length };"],
  ])("does not read a flag: %s", (_form, body) => {
    expect(reads(tool("a.one", body, 'gate: { flags: ["blog"] },'))).toEqual({ "a.one": [] });
  });

  const OPEN = "async function open() { const features = await getFeatures(); if (!features.blog) throw new Error(); }";

  it("a tool answers for its own reads and not for a sibling's", () => {
    const body = `const features = await getFeatures(); if (!features.blog) ${OFF}`;
    expect(reads(`${tool("a.one", body)} ${tool("a.two", "return {};")}`)).toEqual({ "a.one": ["blog"], "a.two": [] });
  });

  it("a read in a helper counts for the tool that calls it, and only that one", () => {
    expect(reads(`${OPEN} ${tool("a.one", "await open();")} ${tool("a.two", "return {};")}`)).toEqual({
      "a.one": ["blog"],
      "a.two": [],
    });
  });

  it.each([
    ["an arrow function", 'const open = async () => { const { blog } = await getFeatures(); if (!blog) throw new Error(); };', "await open();"],
    ["a function expression", "const open = async function () { const { blog } = await getFeatures(); if (!blog) throw new Error(); };", "await open();"],
    ["a helper's helper", `${OPEN} async function outer() { await open(); }`, "await outer();"],
    ["passed along", `${OPEN} `, "return run(open);"],
    ["under another name at the top of the file", `${OPEN} const check = open;`, "await check();"],
    ["wrapped", `${OPEN} const check = once(open);`, "await check();"],
    ["held in an object", `${OPEN} const guards = { open };`, "await guards.open();"],
    ["written in an object", "const guards = { open: async () => (await getFeatures()).blog };", "await guards.open();"],
    ["taken apart at the top of the file", `${OPEN} const { check } = { check: open };`, "await check();"],
    ["handed the flags under the name features", "async function check(features) { if (!features.blog) throw new Error(); }", "await check(await getFeatures());"],
  ])("a helper is followed: %s", (_form, helpers, body) => {
    expect(reads(`${helpers} ${tool("a.one", body)}`)).toEqual({ "a.one": ["blog"] });
  });

  it("a tool that calls a sibling tool's handler answers for what that tool reads", () => {
    const one = `export const one = defineTool({ name: "a.one", handler: async () => { if (!(await getFeatures()).blog) ${OFF} } });`;
    const call = "return one.handler({}, ctx);";
    expect(reads(`${one} ${tool("a.two", call)}`)).toEqual({ "a.one": ["blog"], "a.two": ["blog"] });
    expect(reads(one, `import { one } from "@/lib/tools/file0"; ${tool("b.one", call)}`)).toEqual({ "a.one": ["blog"], "b.one": ["blog"] });
  });

  it("a tool that names a table of helpers answers for all of it: the walk cannot tell which it calls", () => {
    const guards = "const guards = { a: async () => (await getFeatures()).blog, b: async () => (await getFeatures()).reviews };";
    expect(reads(`${guards} ${tool("a.one", "await guards.a();")}`)).toEqual({ "a.one": ["blog", "reviews"] });
  });

  it("a handler that is a function of the file is followed, by a key and by shorthand", () => {
    const handler = "async function run() { const features = await getFeatures(); return features.blog; }";
    const byKey = `${handler} export const t = defineTool({ name: "a.one", handler: run });`;
    const byShorthand = handler.replace("function run", "function handler") + ' export const t = defineTool({ name: "a.one", handler });';
    expect(reads(byKey)).toEqual({ "a.one": ["blog"] });
    expect(reads(byShorthand)).toEqual({ "a.one": ["blog"] });
  });

  it("a gate imported from a sibling tool file is followed, under its alias too", () => {
    const gate = `export ${OPEN}`;
    const named = 'import { open } from "@/lib/tools/file0";';
    const aliased = 'import { open as shut } from "./file0";';
    expect(reads(gate, `${named} ${tool("a.one", "await open();")}`)).toEqual({ "a.one": ["blog"] });
    expect(reads(gate, `${aliased} ${tool("a.one", "await shut();")}`)).toEqual({ "a.one": ["blog"] });
    const whole = 'import * as gates from "./file0";';
    expect(reads(gate, `${whole} ${tool("a.one", "await gates.open();")}`)).toEqual({ "a.one": ["blog"] });
    const onward = 'export { open as shut } from "./file0";';
    expect(reads(gate, onward, `import { shut } from "./file1"; ${tool("a.one", "await shut();")}`)).toEqual({ "a.one": ["blog"] });
    expect(reads(gate, `${named} ${tool("a.one", "const open = false; return { open };")}`)).toEqual({ "a.one": [] });
  });

  it.each([
    ["a key and a field", "return { open: 1, other: args.open };"],
    ["a key taken apart", "const { open: shut } = args; return shut;"],
    ["taken out of the input", "const { open } = args; return { open };"],
    ["a local", "const open = false; return { open };"],
    ["a callback's parameter", "return args.list.map((open) => open.id);"],
    ["a loop's variable", "for (const open of args.list) log(open);"],
    ["a caught error", "try { run(); } catch (open) { log(open); }"],
    ["a function of its own", "function open() { return 1; } return open();"],
    ["a type of it", "const shut: ReturnType<typeof open> = args.shut; return shut;"],
  ])("a name that only looks like a helper is not followed: %s", (_form, body) => {
    expect(reads(`${OPEN} ${tool("a.one", body)}`)).toEqual({ "a.one": [] });
  });

  it("a tool's own parameter is not a helper of that name", () => {
    expect(reads(`${OPEN} export const t = defineTool({ name: "a.one", handler: async (open) => open.id });`)).toEqual({ "a.one": [] });
  });

  it("a flags object's name counts where it is bound, not wherever it is spelled the same", () => {
    const other = "const flags = args.plan; return flags.reviews;";
    const bound = `const flags = await getFeatures(); if (!flags.blog) ${OFF}`;
    const helper = "async function open() { const flags = await getFeatures(); if (!flags.blog) throw new Error(); }";
    expect(reads(`${tool("a.one", bound)} ${tool("a.two", other)}`)).toEqual({ "a.one": ["blog"], "a.two": [] });
    expect(reads(`${helper} ${tool("a.one", `await open(); ${other}`)}`)).toEqual({ "a.one": ["blog"] });
    const { unreached } = flagReadsByTool([{ file: "a.ts", source: `${tool("a.one", bound)} ${tool("a.two", other)}` }]);
    expect(unreached).toEqual([]);
  });

  describe("ungatedReads", () => {
    const body = `const features = await getFeatures(); if (!features.blog) ${OFF}`;
    const { byTool } = flagReadsByTool([{ file: "a.ts", source: `${tool("a.one", body)} ${tool("a.two", body)}` }]);

    it("a tool with no gate does not pass on its sibling's", () => {
      expect(ungatedReads(byTool, [{ name: "a.one", gate: { flags: ["blog"] } }, { name: "a.two" }])).toEqual([
        "a.two reads features.blog, and its gate does not name that",
      ]);
    });

    it("a gate on another flag does not count", () => {
      expect(ungatedReads(byTool, [{ name: "a.one", gate: { flags: ["blog"] } }, { name: "a.two", gate: { flags: ["reviews"] } }])).toHaveLength(1);
    });

    it("the same flag in each tool's own gate passes", () => {
      expect(ungatedReads(byTool, [{ name: "a.one", gate: { flags: ["blog"] } }, { name: "a.two", gate: { flags: ["reviews", "blog"] } }])).toEqual([]);
    });

    it("a sibling reading the same flag hides no other path to it", () => {
      const guards = "const guards = { open: async () => (await getFeatures()).blog };";
      const source = `${guards} ${tool("a.one", body, 'gate: { flags: ["blog"] },')} ${tool("a.two", "await guards.open();")}`;
      const found = flagReadsByTool([{ file: "a.ts", source }]);
      expect(found.unreached).toEqual([]);
      expect(ungatedReads(found.byTool, [{ name: "a.one", gate: { flags: ["blog"] } }, { name: "a.two" }])).toEqual([
        "a.two reads features.blog, and its gate does not name that",
      ]);
    });
  });

  describe("a read no tool gets to", () => {
    const unreached = (...sources: string[]) =>
      flagReadsByTool(sources.map((source, index) => ({ file: `file${index}.ts`, source }))).unreached;
    const GUARDS = "class Guards { async open() { return (await getFeatures()).blog; } }";

    it("is reported: code nothing calls", () => {
      expect(unreached(`${OPEN} ${tool("a.one", "return {};")}`)).toEqual(["file0.ts:1 reads features.blog, and no tool gets there"]);
    });

    it("is reported: a path the walk cannot follow", () => {
      expect(unreached(`${GUARDS} ${tool("a.one", "await new Guards().open();")}`)).toHaveLength(1);
    });

    it("is reported though a sibling reads the same flag: a read is told by where it is, not by its flag", () => {
      const direct = tool("a.one", `if (!(await getFeatures()).blog) ${OFF}`, 'gate: { flags: ["blog"] },');
      expect(unreached(`${direct}\n${GUARDS} ${tool("a.two", "await new Guards().open();")}`)).toEqual([
        "file0.ts:2 reads features.blog, and no tool gets there",
      ]);
    });

    it("is reported flag by flag", () => {
      const helper = "async function open() { const { reviews, blog } = await getFeatures(); return blog && reviews; }";
      expect(unreached(`${helper} ${tool("a.one", "return {};")}`)).toEqual([
        "file0.ts:1 reads features.reviews, and no tool gets there",
        "file0.ts:1 reads features.blog, and no tool gets there",
      ]);
    });

    it("is reported: a local called like the helper does not get there", () => {
      expect(unreached(`${OPEN} ${tool("a.one", "const { open } = args; return { open };")}`)).toHaveLength(1);
    });

    it("is not reported when a tool in a sibling file gets there", () => {
      const home = `export ${OPEN} ${tool("a.one", "return {};")}`;
      expect(unreached(home, `import { open } from "./file0"; ${tool("b.one", "await open();")}`)).toEqual([]);
    });

    it("an import alone neither reads nor reaches: the read answers where it sits", () => {
      const importer = `import { open } from "./file0"; ${tool("b.one", "return {};")}`;
      expect(unreached(`export ${OPEN} ${tool("a.one", "await open();")}`, importer)).toEqual([]);
      expect(unreached(`export ${OPEN} ${tool("a.one", "return {};")}`, importer)).toEqual([
        "file0.ts:1 reads features.blog, and no tool gets there",
      ]);
    });

    it("is not asked of a file that defines no tool", () => {
      expect(unreached("export const shown = async () => (await getFeatureGateState()).features.blog;")).toEqual([]);
    });

    it("is not reported when a tool gets there", () => {
      expect(unreached(`${OPEN} ${tool("a.one", "await open();")}`)).toEqual([]);
    });
  });

  describe("readsFlagsFromConfig", () => {
    const CONFIG = 'import { brand } from "@/brand.config";';

    it.each([
      ["a read", `${CONFIG} export const on = brand.features.blog;`],
      ["through a cast", `${CONFIG} export const on = (brand.features as { blog?: boolean }).blog;`],
      ["through a cast of the config", `${CONFIG} export const on = (brand as { features: { blog: boolean } }).features.blog;`],
      ["the whole object", `${CONFIG} export const on = Object.keys(brand.features);`],
      ["by a string key", `${CONFIG} export const on = brand["features"].blog;`],
      ["taken apart", `${CONFIG} const { features } = brand; export const on = features.blog;`],
      ["under an alias", 'import { brand as config } from "@/brand.config"; export const on = config.features.blog;'],
      ["by a relative path", 'import { brand } from "../../brand.config"; export const on = brand.features.blog;'],
      ["imported late", 'export async function on() { const { brand } = await import("@/brand.config"); return brand.features.blog; }'],
    ])("yes: %s", (_form, source) => {
      expect(readsFlagsFromConfig(source)).toBe(true);
    });

    it.each([
      ["the merged brand", 'import { getBrand } from "@/lib/brand"; const brand = await getBrand(); export const on = brand.features.blog;'],
      ["another field", `${CONFIG} export const name = brand.storeName;`],
      ["another module's brand", 'import { brand } from "@/lib/other"; export const on = brand.features.blog;'],
      ["a string", `${CONFIG} export const note = "brand.features.blog";`],
      ["a comment", `${CONFIG} // brand.features.blog`],
      ["a local of the import's name", `${CONFIG} export async function on() { const brand = await getBrand(); return brand.features.blog; }`],
      ["a parameter of the import's name", `${CONFIG} export const on = (brand) => brand.features.blog;`],
      ["taken apart from a local of that name", `${CONFIG} export async function on() { const brand = await getBrand(); const { features } = brand; return features; }`],
      ["an undeclared name", `${CONFIG} export const on = other.features.blog;`],
      ["another module's brand beside the config", 'import { brand as config } from "@/brand.config"; import { brand } from "@/lib/other"; export const on = brand.features.blog;'],
      ["a local beside a late import", 'export async function a() { const { brand } = await import("@/brand.config"); return brand.storeName; } export async function b() { const brand = await getBrand(); return brand.features.blog; }'],
    ])("no: %s", (_form, source) => {
      expect(readsFlagsFromConfig(source)).toBe(false);
    });
  });
});
