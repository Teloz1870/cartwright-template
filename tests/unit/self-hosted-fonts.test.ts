import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * FONT1: fonts are self-hosted (`next/font/local`) from app/fonts/, so a build
 * never fetches them from Google. `next/font/google` flaked red builds three
 * times on 2026-10-03 alone; the files are fetched once by
 * scripts/fonts/fetch.mjs. The root layout's Geist pair moved first (FONT1-a),
 * then Archivo, Space Grotesk and Space Mono (FONT1-b, one module per family:
 * app/fonts/<family>/font.ts) — the families whose every caller moved with them.
 *
 * Pins, for EVERY localFont call over app/fonts (root layout + family modules):
 *  1. every `src` exists, and fonts.json records it with the sha256 of the bytes
 *     on disk (a hand-swapped file goes red);
 *  2. every face Google serves is still served: each fonts.json face is either a
 *     preloaded `src` (same weight, style and unicode-range) in every call over
 *     that directory, or a face in the faces.css the caller imports —
 *     `next/font/google` emitted ALL subsets, so dropping one would move e.g.
 *     "№" (Cyrillic subset) out of Geist Mono;
 *  3. the face carries the family's REAL name, and the CSS variable reaches it:
 *     Turbopack names a local font's family and variable after the binding, so a
 *     name with a space ("Space Mono") is declared on the face and listed right
 *     after the binding's inert name in `fallback`;
 *  4. next/font/google's fallback face (same name, same override metrics), and
 *     `adjustFontFallback: false` so Next's own generator does not shadow it;
 *  5. the licence travels with the files;
 *  6. the variables are the ones their readers use: the root layout's
 *     `--font-geist-sans`/`--font-geist-mono`, and each family module's
 *     variable in the CSS of every pack that imports it;
 *  7. every web font a design pack names LITERALLY in its tokens
 *     (`sans: "Space Grotesk, …"`, in either quote style) is a declared face —
 *     or, until its pack moves, still loaded through next/font/google;
 *  8. no family is self-hosted while a `next/font/google` call still loads it.
 *     Both loaders declare faces under the family's real name but serve the
 *     bytes at different URLs, and every pack's CSS is on every page: the
 *     browser merges the two face sets, downloads the same file twice (once as
 *     the Google preload), and which copy a weight uses depends on CSS chunk
 *     order (FONT1-b review, measured). A family moves with its LAST Google
 *     caller — and is then preloaded, as next/font/google preloaded it.
 *
 * Engine-only (the repo-hygiene probe), like site-font-safe.test.ts: a
 * customer may change their fonts freely.
 */
const ROOT = path.resolve(__dirname, "../..");
const isEngineCheckout = existsSync(path.join(ROOT, ".github", "sync-excludes.txt"));
const FONTS = path.join(ROOT, "app/fonts");
const LAYOUT = "app/layout.tsx";

type FontsJson = {
  family: string;
  call: { functionName: string };
  cssFamilies: string[];
  files: { file: string; weight: string; style: string; sha256: string; preload: boolean; unicodeRange: string }[];
};
type Call = {
  caller: string;
  binding: string;
  dir: string;
  src: Face[];
  family: string;
  range: string | undefined;
  fallback: string[];
  variable: string | undefined;
  body: string;
};

const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const fontDirs = () => readdirSync(FONTS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const record = (dir: string) => JSON.parse(readFileSync(path.join(FONTS, dir, "fonts.json"), "utf8")) as FontsJson;
const familyModules = () => fontDirs().filter((d) => existsSync(path.join(FONTS, d, "font.ts"))).map((d) => `app/fonts/${d}/font.ts`);

type Face = { file: string; weight: string; style: string };
/** A src entry or faces.css face (path or bare file name) is this fonts.json face. */
const matches = (x: Face, f: Face) => path.basename(x.file) === f.file && x.weight === f.weight && x.style === f.style;

/** Every `const X = localFont({ … });` in a file, parsed. */
function callsIn(caller: string): Call[] {
  const text = read(caller);
  return [...text.matchAll(/^(?:export )?const (\w+) = localFont\(\{\n([\s\S]*?)\n\}\);/gm)].map(([, binding, body]) => {
    const src = [...body.matchAll(/\{ path: "([^"]+)", weight: "([^"]+)", style: "([^"]+)" \}/g)].map(([, p, weight, style]) => ({
      file: path.relative(ROOT, path.resolve(ROOT, path.dirname(caller), p)).split(path.sep).join("/"),
      weight,
      style,
    }));
    const dirs = [...new Set(src.map((s) => s.file.split("/").slice(0, 3).join("/")))];
    expect(dirs, `${caller} ${binding}: every src must sit in ONE app/fonts/<family>/ directory`).toHaveLength(1);
    expect(dirs[0]).toMatch(/^app\/fonts\/[^/]+$/);
    return {
      caller,
      binding,
      dir: dirs[0].split("/")[2],
      src,
      family: /prop: "font-family", value: "([^"]+)"/.exec(body)?.[1] ?? binding,
      range: /prop: "unicode-range", value: "([^"]+)"/.exec(body)?.[1],
      fallback: [.../fallback: \[([^\]]*)\]/.exec(body)?.[1].matchAll(/"([^"]+)"/g) ?? []].map((m) => m[1]),
      variable: /variable: "([^"]+)"/.exec(body)?.[1],
      body,
    };
  });
}

/** The faces.css files a caller imports, as repo paths. */
function importedFaces(caller: string): string[] {
  return [...read(caller).matchAll(/^import "([^"]*faces\.css)";$/gm)].map(([, spec]) =>
    (spec.startsWith("@/") ? spec.slice(2) : path.relative(ROOT, path.resolve(ROOT, path.dirname(caller), spec))).split(path.sep).join("/"),
  );
}

/** Families still loaded through next/font/google anywhere in the shipped roots. */
function googleFamilies(): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "generated") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name)) {
        // Every import statement, not just the first (a file may import display and body fonts separately).
        for (const [, names] of readFileSync(full, "utf8").matchAll(/import \{([^}]+)\} from ["']next\/font\/google["']/g)) {
          for (const fn of names.split(",")) out.add(fn.trim().split(/\s+as\s+/)[0].replace(/_/g, " "));
        }
      }
    }
  };
  for (const root of ["app", "components", "designs", "lib", "plugins"]) if (existsSync(path.join(ROOT, root))) walk(path.join(ROOT, root));
  return out;
}

describe.skipIf(!isEngineCheckout)("fonts are self-hosted (FONT1)", () => {
  const layout = read(LAYOUT);
  const callers = [LAYOUT, ...familyModules()];
  const calls = callers.flatMap(callsIn);

  it("the root layout imports no next/font/google, and every font directory has a caller", () => {
    expect(layout).not.toMatch(/from\s+["']next\/font\/google["']/);
    expect(layout).toMatch(/from\s+["']next\/font\/local["']/);
    expect(familyModules().length).toBeGreaterThan(0);
    for (const d of fontDirs()) expect(calls.some((c) => c.dir === d), `app/fonts/${d} has no localFont call`).toBe(true);
  });

  it("pins the root layout's variables, and every pack reads one the layout sets (FONT1-a)", () => {
    const root = callsIn(LAYOUT);
    expect(root.find((c) => c.family === "Geist")?.variable).toBe("--font-geist-sans");
    expect(root.find((c) => c.family === "Geist Mono")?.variable).toBe("--font-geist-mono");
    const set = new Set(root.map((c) => c.variable));
    const read_ = new Set<string>();
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(css|tsx?)$/.test(e.name)) for (const m of readFileSync(full, "utf8").matchAll(/var\((--font-geist[\w-]*)/g)) read_.add(m[1]);
      }
    };
    walk(path.join(ROOT, "designs"));
    expect(read_.size, "no pack reads a Geist variable — the scan is broken").toBeGreaterThan(0);
    expect([...read_].filter((v) => !set.has(v))).toEqual([]);
  });

  it.each(calls.flatMap((c) => c.src.map((s) => [`${c.caller} ${c.binding}`, s.file])))("%s: %s exists and matches its fonts.json sha256", (_, rel) => {
    const abs = path.join(ROOT, rel);
    expect(existsSync(abs), `${rel} is missing`).toBe(true);
    const entry = record(rel.split("/")[2]).files.find((f) => f.file === path.basename(rel));
    expect(entry, `${rel} is not listed in its fonts.json`).toBeDefined();
    expect(createHash("sha256").update(readFileSync(abs)).digest("hex")).toBe(entry!.sha256);
  });

  it("each face carries the family's real name, and the variable reaches it", () => {
    for (const c of calls) {
      const r = record(c.dir);
      expect(c.family, `${c.caller} ${c.binding}: the face must be "${r.family}"`).toBe(r.family);
      expect(r.cssFamilies, `${c.dir}/faces.css must declare "${c.family}"`).toContain(c.family);
      // The variable is `"<binding>", <fallback…>`: the face's name must come before its fallback face.
      const chain = [c.binding, ...c.fallback];
      expect(chain.indexOf(c.family), `${c.caller} ${c.binding}: ${chain.join(", ")} never names "${c.family}"`).toBeGreaterThanOrEqual(0);
      expect(chain.indexOf(c.family)).toBeLessThan(chain.indexOf(`${r.family} Fallback`));
    }
  });

  it("serves every face: preloaded in the call, the rest from the faces.css it imports", () => {
    for (const d of fontDirs()) {
      const r = record(d);
      const css = readFileSync(path.join(FONTS, d, "faces.css"), "utf8");
      const faces = [
        ...css.matchAll(/@font-face \{[^}]*font-family: "([^"]+)";\s*font-style: (\w+);\s*font-weight: ([^;]+);[^}]*url\("\.\/([^"]+)"\) format\("(\w+)"\);\s*unicode-range: ([^;]+);/g),
      ].map(([, family, style, weight, file, format, range]) => ({ family, style, weight, file, format, range }));
      const mine = calls.filter((c) => c.dir === d);
      for (const c of mine) expect(importedFaces(c.caller), `${c.caller} must import app/fonts/${d}/faces.css`).toContain(`app/fonts/${d}/faces.css`);
      for (const f of r.files) {
        const same = (x: Face) => matches(x, f);
        if (f.preload) {
          for (const c of mine) {
            expect(c.src.some(same), `${c.caller} ${c.binding} lacks ${f.file} ${f.weight} ${f.style}`).toBe(true);
            expect(c.range).toBe(f.unicodeRange);
          }
          expect(faces.some((x) => x.file === f.file), `${f.file} is preloaded AND in faces.css`).toBe(false);
        } else {
          for (const family of r.cssFamilies) {
            const face = faces.find((x) => same(x) && x.family === family);
            expect(face, `${d}/faces.css lacks ${f.file} ${f.weight} ${f.style} as "${family}"`).toBeDefined();
            expect(face!.range).toBe(f.unicodeRange);
          }
        }
      }
      // The CSS format() hint follows the file type (FONT1-b: it was hard-coded "woff2").
      for (const x of faces) expect(x.format).toBe({ woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" }[path.extname(x.file).slice(1)]);
      for (const c of mine) for (const s of c.src) expect(r.files.some((f) => f.preload && matches(s, f)), `${c.caller} names a face fonts.json does not preload: ${s.file} ${s.weight}`).toBe(true);
      expect(faces.length).toBe(r.files.filter((f) => !f.preload).length * r.cssFamilies.length);
    }
  });

  it("keeps next/font/google's fallback face: same name, same override metrics", async () => {
    const { getFallbackFontOverrideMetrics } = (await import(
      "next/dist/compiled/@next/font/dist/google/get-fallback-font-override-metrics.js"
    )) as { getFallbackFontOverrideMetrics: (family: string) => Record<string, string> };
    for (const d of fontDirs()) {
      const r = record(d);
      const css = readFileSync(path.join(FONTS, d, "faces.css"), "utf8");
      const m = getFallbackFontOverrideMetrics(r.family);
      const face = new RegExp(`font-family: "${r.family} Fallback";\\s*src: local\\("([^"]+)"\\);\\s*ascent-override: ([^;]+);\\s*descent-override: ([^;]+);\\s*line-gap-override: ([^;]+);\\s*size-adjust: ([^;]+);`).exec(css);
      expect(face, `${d}/faces.css lacks "${r.family} Fallback"`).not.toBeNull();
      expect(face!.slice(1)).toEqual([m.fallbackFont, m.ascentOverride, m.descentOverride, m.lineGapOverride, m.sizeAdjust]);
    }
    // Next's own metrics generator would shadow them with a file-measured face.
    for (const c of calls) {
      expect(c.body, `${c.caller} ${c.binding}`).toContain("adjustFontFallback: false");
      expect(c.fallback, `${c.caller} ${c.binding}`).toContain(`${record(c.dir).family} Fallback`);
    }
  });

  it("every font directory carries its licence", () => {
    for (const d of fontDirs()) {
      const license = path.join(FONTS, d, "LICENSE.txt");
      expect(existsSync(license), `app/fonts/${d}/LICENSE.txt is missing`).toBe(true);
      expect(readFileSync(license, "utf8")).toMatch(/Open Font License|Apache License|Ubuntu Font Licence/);
    }
  });

  it("every pack that imports a family module reads that module's variable", () => {
    const variableOf = new Map(familyModules().map((m) => [m.replace(/\.ts$/, ""), callsIn(m)[0].variable!]));
    let checked = 0;
    for (const pack of readdirSync(path.join(ROOT, "designs"), { withFileTypes: true }).filter((d) => d.isDirectory())) {
      const dir = path.join(ROOT, "designs", pack.name);
      const files = readdirSync(dir, { recursive: true, encoding: "utf8" });
      const css = files.filter((f) => f.endsWith(".css")).map((f) => readFileSync(path.join(dir, f), "utf8")).join("\n");
      const used = new Set(
        files.filter((f) => /\.tsx?$/.test(f)).flatMap((f) => [...readFileSync(path.join(dir, f), "utf8").matchAll(/from "@\/(app\/fonts\/[^"]+\/font)"/g)].map((m) => m[1])),
      );
      for (const mod of used) {
        expect(variableOf.has(mod), `designs/${pack.name} imports unknown ${mod}`).toBe(true);
        expect(css, `designs/${pack.name}'s CSS never reads ${variableOf.get(mod)} (from ${mod})`).toMatch(new RegExp(`var\\(${variableOf.get(mod)}\\s*[,)]`));
        checked++;
      }
    }
    expect(checked, "no pack imports a family module — the scan is broken").toBeGreaterThan(0);
  });

  it("loads every web font a design pack names literally: a self-hosted face, or (until it moves) Google", () => {
    const declared = new Set(calls.map((c) => c.family));
    const google = googleFamilies();
    const SYSTEM = new Set(["system-ui", "-apple-system", "ui-sans-serif", "ui-serif", "ui-monospace", "sans-serif", "serif", "monospace"]);
    const named = new Map<string, string>();
    for (const pack of readdirSync(path.join(ROOT, "designs"), { withFileTypes: true }).filter((d) => d.isDirectory())) {
      const index = path.join(ROOT, "designs", pack.name, "index.ts");
      if (!existsSync(index)) continue;
      // Both quote styles: `sans: "Geist, …"` and `sans: 'Geist, …'` (FONT1-SCAN-QUOTES).
      for (const m of readFileSync(index, "utf8").matchAll(/\b(?:sans|mono|display):\s*(["'])\s*([^,"']+)/g)) {
        const family = m[2].trim();
        if (!family.startsWith("var(") && !SYSTEM.has(family)) named.set(family, pack.name);
      }
    }
    expect([...named.keys()], "the scan finds no pack naming Geist Mono — it is broken").toContain("Geist Mono");
    expect([...named].filter(([f]) => !declared.has(f) && !google.has(f)).map(([f, p]) => `${p}: ${f}`)).toEqual([]);
  });

  it("self-hosts a family only once no next/font/google call loads it, and preloads it as Google did", () => {
    const google = googleFamilies();
    expect(google.size, "the scan finds no next/font/google family — it is broken").toBeGreaterThan(0);
    for (const c of calls) {
      expect(google.has(c.family), `${c.caller} self-hosts "${c.family}" while next/font/google still loads it — move its last Google caller in the same change`).toBe(false);
      expect(c.body, `${c.caller} ${c.binding}: next/font/google preloaded this family`).not.toMatch(/preload: false/);
    }
  });
});
