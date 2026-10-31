#!/usr/bin/env node
/**
 * scripts/fonts/fetch.mjs — download a Google font ONCE, so the build never has to.
 *
 * `next/font/google` fetches its CSS and woff2 files from Google on every cold
 * build. That fetch flakes: measured three times on 2026-10-03 alone (a release
 * scaffold gate, a local Solbrillen build, a Northbound Vercel deploy), each a
 * red build with identical code that went green on retry (backlog FONT1).
 * The cure is `next/font/local` with the files checked in next to their caller.
 *
 * This script fetches exactly what `next/font/google` would have fetched for a
 * given call site, by calling Next's OWN functions for it — the same option
 * validation, the same axis resolution, the same URL, the same user agent — so
 * the self-hosted files are the very bytes the Google loader used to emit.
 *
 * Usage (run from the repo root):
 *   node scripts/fonts/fetch.mjs <FunctionName> '<options JSON>' <out dir> [css families]
 *   node scripts/fonts/fetch.mjs Geist '{"subsets":["latin"]}' app/fonts/geist
 *   node scripts/fonts/fetch.mjs Space_Mono '{"subsets":["latin"],"weight":["400","700"],"display":"swap"}' app/fonts/space-mono
 *
 * Pass the call site's options verbatim: they decide which faces Google returns.
 * A variable font asked for several weights comes back as one face per weight
 * sharing ONE file — written once, named once per weight in the printed `src`.
 *
 * Google serves one @font-face per subset (latin, latin-ext, cyrillic, …), each
 * with its own `unicode-range`, and `next/font/google` emits ALL of them — its
 * `subsets` option only decides which ones are preloaded. So does this script:
 *   - the `subsets` faces are printed as `localFont({ src })` entries (preloaded,
 *     with fallback metrics), plus the `unicode-range` to declare on them;
 *   - every other face goes into a generated `faces.css` under the same family
 *     — import it next to the `localFont` call. The browser fetches one of those
 *     files only when the page shows a character in its range (№, ł, Cyrillic …).
 *     `[css families]` (comma-separated) declares those faces under other or
 *     extra family names, for a call site whose binding renames the family;
 *   - faces.css also declares "<Family> Fallback" with the SAME override metrics
 *     `next/font/google` used (Next's precomputed table, not a measurement of
 *     the file) — give the localFont call `adjustFontFallback: false` and
 *     `fallback: ["<Family> Fallback"]`, and the fallback text, before load and
 *     for characters no subset has (Greek, box-drawing in a sans), stays as it was.
 * Also written: LICENSE.txt, the font's licence from github.com/google/fonts
 * (OFL/Apache/UFL require it to travel with the files), and fonts.json — the
 * call, the Google URL, the fetch date and every file's sha256 and range — so a
 * re-run is reviewable as a diff.
 *
 * All or nothing: every file is written to a staging directory next to <out dir>
 * and moved in only once every download and the licence arrived, so a failed run
 * leaves the directory as it was (faces.css never names a deleted file). Under
 * Next's own test switch, NEXT_FONT_GOOGLE_MOCKED_RESPONSES (CSS by URL; a font
 * `src` that is an absolute path is read from disk), the licence comes from the
 * same mock, so tests run the script offline.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const google = (name) => require(`next/dist/compiled/@next/font/dist/google/${name}`);
const { validateGoogleFontFunctionCall } = google("validate-google-font-function-call");
const { getFontAxes } = google("get-font-axes");
const { getGoogleFontsUrl } = google("get-google-fonts-url");
const { fetchCSSFromGoogleFonts } = google("fetch-css-from-google-fonts");
const { fetchFontFile } = google("fetch-font-file");
const { fetchResource } = google("fetch-resource");
const { getFallbackFontOverrideMetrics } = google("get-fallback-font-override-metrics");

// The CSS `format()` hint each font file type takes.
const FORMATS = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" };

const [functionName, optionsJson, outDir, cssFamiliesArg] = process.argv.slice(2);
if (!functionName || !optionsJson || !outDir) {
  console.error("usage: node scripts/fonts/fetch.mjs <FunctionName> '<options JSON>' <out dir> [css families]");
  process.exit(2);
}

const options = validateGoogleFontFunctionCall(functionName, JSON.parse(optionsJson));
const { fontFamily, weights, styles, display, selectedVariableAxes } = options;
// `subsets` may be absent when `preload: false` — then nothing is preloaded and
// every face goes to faces.css.
const preloaded = options.subsets ?? [];
const cssFamilies = cssFamiliesArg ? cssFamiliesArg.split(",").map((f) => f.trim()).filter(Boolean) : [fontFamily];
const url = getGoogleFontsUrl(fontFamily, getFontAxes(fontFamily, weights, styles, selectedVariableAxes), display);
// Same trim as Next's loader: Google may append a `body { … }` rule.
const css = (await fetchCSSFromGoogleFonts(url, fontFamily, false)).split("body {", 1)[0];

// Google's CSS is a run of `/* <subset> */\n@font-face { … }` blocks.
const faces = [];
for (const [, subset, body] of css.matchAll(/\/\* ([\w-]+) \*\/\s*@font-face\s*\{([^}]*)\}/g)) {
  const prop = (name) => new RegExp(`${name}:\\s*([^;]+);`).exec(body)?.[1].trim();
  const src = /src: url\((.+?)\)/.exec(body)?.[1];
  if (!src) throw new Error(`no src in the ${subset} @font-face of ${fontFamily}`);
  faces.push({ subset, src, style: prop("font-style") ?? "normal", weight: prop("font-weight") ?? "400", unicodeRange: prop("unicode-range") });
}
if (faces.length === 0 || faces.length !== (css.match(/@font-face/g) ?? []).length) {
  throw new Error(`could not read every @font-face of ${fontFamily} (unnamed subsets?) — refusing to write a partial set`);
}
const missing = preloaded.filter((s) => !faces.some((f) => f.subset === s));
if (missing.length) throw new Error(`${fontFamily} has no ${missing.join(", ")} subset (Google returned: ${[...new Set(faces.map((f) => f.subset))].join(", ")})`);

const slug = fontFamily.toLowerCase().replace(/\s+/g, "-");
// A sibling of outDir (same filesystem, so the final move is a rename); removed however the run ends.
const parent = path.dirname(path.resolve(outDir));
mkdirSync(parent, { recursive: true });
const stage = mkdtempSync(path.join(parent, `.${path.basename(outDir)}-`));
process.on("exit", () => rmSync(stage, { recursive: true, force: true }));
// A variable font asked for several weights comes back as one face per weight, all
// pointing at the SAME file: write it once, named after every weight it serves.
const weightsOf = (src) => faces.filter((f) => f.src === src).map((f) => f.weight.replace(/\s+/g, "-")).join("_");
const written = new Map();
const files = [];
for (const face of faces) {
  const ext = path.extname(new URL(face.src, "https://fonts.gstatic.com/").pathname).slice(1);
  if (!FORMATS[ext]) throw new Error(`unexpected font file type: ${face.src}`);
  const name = `${slug}-${face.subset}-${face.style}-${weightsOf(face.src)}.${ext}`;
  if (!written.has(face.src)) {
    const bytes = await fetchFontFile(face.src, false);
    writeFileSync(path.join(stage, name), bytes);
    written.set(face.src, createHash("sha256").update(bytes).digest("hex"));
  }
  files.push({
    file: name,
    weight: face.weight,
    style: face.style,
    subset: face.subset,
    unicodeRange: face.unicodeRange,
    preload: preloaded.includes(face.subset),
    sha256: written.get(face.src),
  });
}

// The licence lives next to the sources in google/fonts, under the licence's own directory.
const dir = fontFamily.toLowerCase().replace(/[^a-z0-9]/g, "");
const mocked = process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES;
const fetchLicense = async (u) => (mocked ? (require(mocked)[u] ?? null) : fetchResource(u, false).catch(() => null));
let license = null;
for (const kind of ["ofl", "apache", "ufl"]) {
  const name = kind === "apache" ? "LICENSE.txt" : `${kind.toUpperCase()}.txt`;
  license = await fetchLicense(`https://raw.githubusercontent.com/google/fonts/main/${kind}/${dir}/${name}`);
  if (license) break;
}
if (!license) throw new Error(`no licence found for ${fontFamily} in google/fonts (ofl/apache/ufl) — do not ship the files without one`);
writeFileSync(path.join(stage, "LICENSE.txt"), license);

const lazy = files.filter((f) => !f.preload);
const face = (family, f) =>
  `@font-face {\n  font-family: "${family}";\n  font-style: ${f.style};\n  font-weight: ${f.weight};\n  font-display: ${display};\n` +
  `  src: url("./${f.file}") format("${FORMATS[path.extname(f.file).slice(1)]}");\n  unicode-range: ${f.unicodeRange};\n}\n`;
const metrics = getFallbackFontOverrideMetrics(fontFamily);
if (!metrics) throw new Error(`Next has no fallback metrics for ${fontFamily} — write the fallback face by hand`);
const fallbackFace =
  `@font-face {\n  font-family: "${fontFamily} Fallback";\n  src: local("${metrics.fallbackFont}");\n` +
  `  ascent-override: ${metrics.ascentOverride};\n  descent-override: ${metrics.descentOverride};\n` +
  `  line-gap-override: ${metrics.lineGapOverride};\n  size-adjust: ${metrics.sizeAdjust};\n}\n`;
writeFileSync(
  path.join(stage, "faces.css"),
  `/* Generated by scripts/fonts/fetch.mjs from ${url} — do not edit by hand.\n` +
    ` * The subsets that are not preloaded (the browser fetches one only for a character in its range),\n` +
    ` * and the fallback face with the override metrics next/font/google used. */\n` +
    cssFamilies.flatMap((family) => lazy.map((f) => face(family, f))).join("") +
    fallbackFace,
);

writeFileSync(
  path.join(stage, "fonts.json"),
  `${JSON.stringify({ family: fontFamily, call: { functionName, options: JSON.parse(optionsJson) }, cssFamilies, googleUrl: url, fetchedAt: new Date().toISOString().slice(0, 10), files }, null, 2)}\n`,
);

// Every file is in hand: drop the previous run's font files that nothing names any more, then move the new set in.
const fresh = readdirSync(stage);
mkdirSync(outDir, { recursive: true });
for (const old of readdirSync(outDir)) {
  if (old.startsWith(`${slug}-`) && FORMATS[path.extname(old).slice(1)] && !fresh.includes(old)) unlinkSync(path.join(outDir, old));
}
for (const f of fresh) renameSync(path.join(stage, f), path.join(outDir, f));

console.log(`${fontFamily}: ${written.size} file(s), ${files.length} face(s) → ${outDir} (${lazy.length} in faces.css as ${cssFamilies.join(", ")})`);
// A binding cannot carry a space: such a face is named by declaration and listed first in `fallback`.
const named = fontFamily.includes(" ") ? `"${fontFamily}", ` : "";
console.log(`localFont (see app/fonts/space-mono/font.ts): adjustFontFallback: false, fallback: [${named}"${fontFamily} Fallback"], src (relative to ${outDir}):`);
for (const f of files.filter((x) => x.preload)) {
  console.log(`  { path: "./${f.file}", weight: "${f.weight}", style: "${f.style}" },  // unicode-range: ${f.unicodeRange}`);
}
