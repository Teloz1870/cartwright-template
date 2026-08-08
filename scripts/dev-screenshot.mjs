/**
 * pnpm verify:design [path] [port]   (canonical — `pnpm dev:screenshot` is the same script)
 *
 * The taste rules (DESIGN.md §4) require LOOKING at your design at 1440px AND
 * 390px before calling it done. This script makes that a one-liner for humans
 * and AI agents alike: it screenshots the given path on a RUNNING dev server
 * at both widths, drops the files in .screenshots/ (gitignored), and CHECKS:
 *
 *   - horizontal overflow (scrollWidth > clientWidth)  → warns + exit 1
 *   - exactly one <h1> per page (DESIGN.md a11y rule)  → warns + exit 1
 *
 * Non-zero exit on any violation, so agents can gate on it.
 *
 * Target resolution (first match wins):
 *   1. explicit [path] / [port] arguments
 *   2. .cartwright/dev-url — written by `pnpm dev:agent`, e.g. http://localhost:3001/en
 *   3. "/" on port 3000
 *
 *   pnpm verify:design              # dev-url target, or / at :3000
 *   pnpm verify:design /en/products # a specific path
 *   pnpm verify:design / 3002       # another port
 *
 * Requires the dev server to already be running — it never starts one.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";

const argPath = process.argv[2];
const argPort = process.argv[3] || process.env.PORT;

// `pnpm dev:agent` writes the ACTUAL resolved dev URL (Next auto-increments
// ports) to .cartwright/dev-url — use it as the default target when present.
let devUrl = null;
try {
  devUrl = new URL(readFileSync(".cartwright/dev-url", "utf8").trim());
} catch {
  /* no dev-url file — fall back to localhost:3000 */
}

const origin = argPort ? `http://localhost:${argPort}` : (devUrl?.origin ?? "http://localhost:3000");
const path = argPath || (devUrl && devUrl.pathname !== "/" ? devUrl.pathname : "/");
const url = `${origin}${path.startsWith("/") ? path : `/${path}`}`;
const slug = (path === "/" ? "home" : path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")) || "home";

mkdirSync(".screenshots", { recursive: true });

let violations = 0;

const browser = await chromium.launch();
try {
  for (const [label, width, height] of [
    ["1440", 1440, 900],
    ["390", 390, 844],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      colorScheme: "light",
    });
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
    if (!res || res.status() >= 400) {
      console.error(`✗ ${url} → HTTP ${res?.status() ?? "no response"} — is the dev server running?`);
      process.exit(1);
    }
    await page.waitForTimeout(2_000); // entrance animations settle
    const file = `.screenshots/${slug}-${label}.png`;
    await page.screenshot({ path: file, fullPage: false });
    const { overflow, h1Count } = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      h1Count: document.querySelectorAll("h1").length,
    }));
    console.log(`✓ ${file}`);
    if (overflow > 0) {
      violations++;
      console.error(`  ✗ ${label}px: horizontal overflow: ${overflow}px — content wider than the viewport`);
    }
    if (h1Count !== 1) {
      violations++;
      console.error(
        `  ✗ ${label}px: <h1> count is ${h1Count}, expected exactly 1 (DESIGN.md a11y rule — one <h1> per page)`,
      );
    }
    await page.close();
  }
  if (violations > 0) {
    console.error(`\n✗ ${violations} violation(s) on ${url} — fix, re-run, then LOOK at the screenshots.`);
    process.exit(1);
  }
  console.log("\nChecks passed. Now LOOK at the screenshots (DESIGN.md §4) — capturing is not verifying.");
} finally {
  await browser.close();
}
