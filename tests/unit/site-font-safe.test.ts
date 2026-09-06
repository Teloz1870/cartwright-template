import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import manifest from "../../scaffold/manifest.json";

/**
 * A `--profile site` scaffold must boot with Google's font CDN unreachable.
 *
 * Measured (A5): `designs/index.ts` imports every pack, nine packs and the root
 * layout call `next/font/google` at module scope, and one slow fetch on a
 * first `next dev` answered `GET /en 500` — with the failure cached by
 * Turbopack until `rm -rf .next`. The fix is structural: those packs and the
 * Google-font root layout belong to the `google-fonts` module, which the site
 * profile does not include, and core ships `app/layout.static.tsx` in its
 * place. This test approximates the materializer's file math (excluded
 * modules' files gone, unprovided seams read from their `.static` twin,
 * runtime roots only; the registry codemod is the gate's job) and asserts the
 * `next/font/google` import is absent from everything that would ship.
 *
 * Engine-only, like the mirror sweep in repo-hygiene.test.ts: it pins the
 * ENGINE's manifest against the engine's design packs. A light/full scaffold
 * keeps `tests/unit` but has already had packs pruned by the CLI — and is not
 * a git repo (`--no-git`): the v0.56.0 release scaffold gate went red on
 * exactly that, `git ls-files` → "fatal: not a git repository". Files are
 * walked from disk, never asked of git.
 */
const ROOT = path.resolve(__dirname, "../..");
/** The mirror exclude list never reaches the mirror, so it never reaches a scaffold (same probe as repo-hygiene.test.ts). */
const isEngineCheckout = existsSync(path.join(ROOT, ".github", "sync-excludes.txt"));

/**
 * Every file under ROOT, repo-relative with forward slashes. Skips what `git ls-files`
 * would not list: node_modules, the root-level dot-dirs (.git, .next, .vercel) and the
 * gitignored `app/generated/` Prisma output. Dot-entries BELOW the root are kept —
 * `app/.well-known/**` is tracked, routed, and must stay in the walk.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    if (dir === ROOT && entry.name.startsWith(".")) continue;
    if (dir === path.join(ROOT, "app") && entry.name === "generated") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(path.relative(ROOT, full).split(path.sep).join("/"));
  }
  return out;
}
type Manifest = {
  modules: { slug: string; files: (string | { path: string })[]; seams: string[]; replaces: { target: string }[] }[];
  profiles: { name: string; modules: string[] }[];
};
const m = manifest as unknown as Manifest;
const filesOf = (slug: string) =>
  m.modules.find((x) => x.slug === slug)!.files.map((f) => (typeof f === "string" ? f : f.path));

function includedSet(profile: string, withModules: string[]) {
  const included = new Set(["core", ...withModules, ...m.profiles.find((p) => p.name === profile)!.modules]);
  const excludedPrefixes = m.modules.filter((x) => !included.has(x.slug)).flatMap((x) => filesOf(x.slug));
  const seams = m.modules.filter((x) => included.has(x.slug)).flatMap((x) => x.seams);
  const provided = new Set(
    m.modules.filter((x) => included.has(x.slug)).flatMap((x) => x.replaces.map((r) => r.target)),
  );
  const staticOf = (seam: string) => seam.replace(/(\.[a-z]+)$/i, ".static$1");
  // Runtime roots only — the materializer's whitelist zones (tests/, docs/,
  // scripts/) ship only what included modules claim, and `tests/unit` is
  // pruned from a site scaffold outright.
  const RUNTIME = /^(app|components|designs|hooks|i18n|lib|plugins|types)\/|^[^/]+\.tsx?$/;
  const tracked = walk(ROOT).filter((f) => /\.tsx?$/.test(f) && RUNTIME.test(f));
  const isExcluded = (f: string) =>
    excludedPrefixes.some((p) => f === p || f.startsWith(p.endsWith("/") ? p : `${p}/`));
  const out: { file: string; content: string }[] = [];
  for (const f of tracked) {
    if (isExcluded(f)) continue;
    if (/\.static\.[a-z]+$/.test(f)) continue; // twins are copy sources, deleted after
    const source = seams.includes(f) && !provided.has(f) ? staticOf(f) : f;
    out.push({ file: f, content: readFileSync(path.join(ROOT, source), "utf8") });
  }
  return out;
}

describe.skipIf(!isEngineCheckout)("site profile boots without Google Fonts", () => {
  it.each([[[]], [["contact-form"]]])("no included file imports next/font/google (--with %j)", (withModules) => {
    const offenders = includedSet("site", withModules)
      .filter(({ content }) => /from\s+["']next\/font\/google["']/.test(content))
      .map(({ file }) => file);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the nine Google-font packs are exactly the google-fonts module's claims", () => {
    const claimed = filesOf("google-fonts").filter((f) => f.startsWith("designs/"));
    const tracked = walk(path.join(ROOT, "designs"));
    const packsWithGoogleFonts = new Set(
      tracked
        .filter((f) => /\.(ts|tsx)$/.test(f) && /from\s+["']next\/font\/google["']/.test(readFileSync(path.join(ROOT, f), "utf8")))
        .map((f) => `designs/${f.split("/")[1]}`),
    );
    // Packs claimed elsewhere (webshop, three-scenes) may also use Google fonts;
    // what matters is that none of them is CORE-claimed.
    const corePacks = filesOf("core").filter((f) => /^designs\/[^/]+$/.test(f));
    expect(corePacks.filter((p) => packsWithGoogleFonts.has(p))).toEqual([]);
    for (const p of claimed) expect(packsWithGoogleFonts.has(p), `${p} claimed by google-fonts but has no Google font`).toBe(true);
  });

  it("app/layout.static.tsx is app/layout.tsx minus the font block — nothing else may drift", () => {
    // Exactly the transformation that produced the twin, applied to both sides:
    // the real layout loses its Google-font import, the two font constants and
    // the variable classes; the twin loses its header docblock and the injected
    // system-stack <style>. What remains must be identical, so any other edit to
    // the root layout that is not mirrored into the twin goes red here.
    const real = readFileSync(path.join(ROOT, "app/layout.tsx"), "utf8")
      .replace('import { Geist, Geist_Mono } from "next/font/google";\n', "")
      .replace(/const geistSans = Geist\(\{[\s\S]*?\}\);\n\nconst geistMono = Geist_Mono\(\{[\s\S]*?\}\);\n\n/, "")
      .replace("className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}", 'className="h-full antialiased"');
    const twin = readFileSync(path.join(ROOT, "app/layout.static.tsx"), "utf8")
      .replace(/^\/\*\*[\s\S]*?\*\/\n/, "")
      .replace(/        \{\/\* The Google-font layout[\s\S]*?        \/>\n/, "");
    expect(real).not.toContain("next/font/google");
    expect(twin).not.toContain("next/font/google");
    expect(twin).toBe(real);
  });
});
