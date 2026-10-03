#!/usr/bin/env node
/**
 * capture-locales.mjs — photograph a storefront in every locale it serves.
 *
 * The companion to a text-level language check, and NOT a substitute for one:
 * a text gate proves the words are right, this proves they still FIT. English
 * strings are routinely 20-40% longer than their Danish source ("Handelsbe-
 * tingelser" → "Terms and conditions"), and the failure that costs a customer
 * is a nav item wrapping onto two lines or a button clipping its own label —
 * neither of which any string comparison can see.
 *
 * Usage:
 *   pnpm capture:locales                                  # localhost, brand.locales
 *   pnpm capture:locales -- --origin https://example.com
 *   pnpm capture:locales -- --locales da,en --paths /,/produkter,/cart
 *   pnpm capture:locales -- --viewports 1440x900,390x844
 *
 * Flags:
 *   --origin <url>      site to photograph (default: http://localhost:3000; if
 *                       nothing answers there, a `pnpm dev` is spawned and killed again)
 *   --locales a,b       locale prefixes (default: parsed from brand.config.ts `locales`)
 *   --paths /a,/b       paths under each locale (default: /,/produkter,/cart,/about)
 *   --viewports WxH,... default 1440x900 (desktop) and 390x844 (mobile)
 *   --out <dir>         output directory (default: locale-shots/ — gitignored)
 *   --full              full-page screenshots instead of viewport-only
 *
 * Output: <out>/<host>/<locale><path>-<width>.png, plus an index.md listing
 * every capture side by side per path so the two locales can be compared
 * directly rather than one after the other.
 *
 * A path that 404s or errors is reported and the run exits non-zero — a
 * missing route is a finding, not a reason to produce a partial gallery in
 * silence.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

/** Locales the shop actually serves, read from brand.config rather than assumed. */
function brandLocales() {
  const src = fs.readFileSync(path.join(ROOT, "brand.config.ts"), "utf8");
  const m = src.match(/locales:\s*\[([^\]]*)\]/);
  if (!m) return ["en"];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

const ORIGIN = (flag("origin", "http://localhost:3000") || "").replace(/\/+$/, "");
const LOCALES = flag("locales", "")
  ? flag("locales", "").split(",").map((s) => s.trim()).filter(Boolean)
  : brandLocales();
const PATHS = flag("paths", "/,/produkter,/cart,/about")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const VIEWPORTS = flag("viewports", "1440x900,390x844")
  .split(",")
  .map((s) => {
    const [w, h] = s.trim().split("x").map(Number);
    return { width: w, height: h };
  });
const OUT = path.resolve(ROOT, flag("out", "locale-shots"));

async function reachable(url) {
  try {
    const r = await fetch(url, { redirect: "follow" });
    return r.status;
  } catch {
    return 0;
  }
}

async function main() {
  const { chromium } = await import("@playwright/test");

  let dev = null;
  if (ORIGIN.includes("localhost") && !(await reachable(ORIGIN))) {
    console.log(`nothing on ${ORIGIN} — starting pnpm dev`);
    dev = spawn("pnpm", ["dev"], { cwd: ROOT, stdio: "ignore", detached: true });
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (await reachable(ORIGIN)) break;
    }
  }

  const host = new URL(ORIGIN).host.replace(/[^a-z0-9.-]/gi, "_");
  const dir = path.join(OUT, host);
  fs.mkdirSync(dir, { recursive: true });

  const browser = await chromium.launch();
  const rows = [];
  let failures = 0;
  try {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: vp });
      const page = await ctx.newPage();
      for (const p of PATHS) {
        for (const locale of LOCALES) {
          const url = `${ORIGIN}/${locale}${p === "/" ? "" : p}`;
          const slug = `${locale}${p === "/" ? "-home" : p.replace(/\//g, "-")}-${vp.width}`;
          const file = path.join(dir, `${slug}.png`);
          let status = 0;
          try {
            // `load`, never `networkidle`: a site with a long-lived connection
            // (a chat widget, an analytics beacon, a poll) never reaches idle,
            // and the capture times out on a page that is perfectly fine —
            // measured on the Teloz canary, which answers 200 but never idles.
            // Playwright discourages networkidle for exactly this reason.
            const res = await page.goto(url, { waitUntil: "load", timeout: 30000 });
            status = res?.status() ?? 0;
            // Let webfonts swap and lazy images settle. A screenshot taken at
            // `load` catches the fallback font, which reads as a layout bug
            // that is not there.
            await page.waitForTimeout(1500);
          } catch (err) {
            console.log(`  ✗ ${url} — ${String(err).split("\n")[0]}`);
            failures++;
            continue;
          }
          if (status !== 200) {
            console.log(`  ✗ ${url} — HTTP ${status}`);
            failures++;
            continue;
          }
          await page.screenshot({ path: file, fullPage: has("full") });
          console.log(`  ✓ ${url} → ${path.relative(ROOT, file)}`);
          rows.push({ path: p, locale, width: vp.width, file: `${slug}.png` });
        }
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    if (dev?.pid) {
      try {
        process.kill(-dev.pid);
      } catch {
        /* already gone */
      }
    }
  }

  // Index groups by path+viewport so the locales sit SIDE BY SIDE. Comparing
  // two locales one scroll apart is how a wrapped nav item goes unnoticed.
  const byGroup = new Map();
  for (const r of rows) {
    const key = `${r.path} @ ${r.width}px`;
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(r);
  }
  let md = `# ${host} — locale capture\n\n`;
  for (const [key, group] of byGroup) {
    md += `## ${key}\n\n`;
    md += `| ${group.map((g) => g.locale).join(" | ")} |\n`;
    md += `|${group.map(() => "---").join("|")}|\n`;
    md += `| ${group.map((g) => `![${g.locale}](${g.file})`).join(" | ")} |\n\n`;
  }
  fs.writeFileSync(path.join(dir, "index.md"), md);
  console.log(`\n${rows.length} captures → ${path.relative(ROOT, dir)}`);
  if (failures) {
    console.log(`${failures} path(s) failed — a missing route is a finding.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
