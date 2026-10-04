#!/usr/bin/env node
/**
 * capture-gallery.mjs — committed gallery-asset capture pipeline.
 *
 * Captures a homepage screenshot (and optionally a slow-scroll video for 3D
 * designs) for every DesignPack, by temporarily pinning `designSlug` in
 * brand.config.ts and photographing localhost with Playwright. This is the
 * proven pattern used for the cartwright.app design gallery
 * (`apps/web/public/designs/<slug>.{jpg,webm,mp4}` in the cartwright-app repo
 * — see docs/design-language.md → "Adding design #26", step 4).
 *
 * Usage:
 *   pnpm capture:gallery                          # all designs, screenshots only
 *   pnpm capture:gallery -- --slugs halo,apex     # specific designs
 *   pnpm capture:gallery -- --video               # + webm/mp4 for threeD designs
 *   pnpm capture:gallery -- --out my-dir --port 3017
 *
 * Flags:
 *   --slugs a,b   comma-separated design slugs (default: ALL slugs parsed from
 *                 designs/options.ts DESIGN_OPTIONS)
 *   --video       also record a 60-step slow-scroll video for designs that have
 *                 threeD: true in designs/tokens.ts (webm + mp4 via ffmpeg)
 *   --out <dir>   output directory (default: gallery-assets/ — gitignored)
 *   --port <n>    dev-server port (default: 3000). If nothing answers on the
 *                 port, the script spawns its own `pnpm dev` (PORT=<n>) and
 *                 kills it again on exit.
 *
 * Safety: brand.config.ts is ALWAYS restored (`git checkout -- brand.config.ts`)
 * in a finally block — even on crash/SIGINT. Any slug whose page renders the
 * Next.js error page ("unexpected error") is logged as FAIL and skipped; the
 * script then exits non-zero at the end.
 */

import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BRAND_CONFIG = path.join(ROOT, "brand.config.ts");

// ───────────────────────── arg parsing ─────────────────────────

function parseArgs(argv) {
  const args = { slugs: null, video: false, out: "gallery-assets", port: 3000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--slugs") args.slugs = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--slugs=")) args.slugs = a.slice(8).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--video") args.video = true;
    else if (a === "--out") args.out = argv[++i] ?? args.out;
    else if (a.startsWith("--out=")) args.out = a.slice(6);
    else if (a === "--port") args.port = Number(argv[++i]);
    else if (a.startsWith("--port=")) args.port = Number(a.slice(7));
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  if (!Number.isInteger(args.port) || args.port <= 0) {
    console.error(`Invalid --port value`);
    process.exit(2);
  }
  return args;
}

// ─────────────────── design registry (regex-parsed) ───────────────────
// The script is plain .mjs (no tsx dependency at run time), so it regex-parses
// the two client-safe TS registries instead of importing them.

function allDesignSlugs() {
  const src = fs.readFileSync(path.join(ROOT, "designs/options.ts"), "utf8");
  const block = src.slice(src.indexOf("DESIGN_OPTIONS"), src.indexOf("];", src.indexOf("DESIGN_OPTIONS")));
  return [...block.matchAll(/slug:\s*"([\w-]+)"/g)].map((m) => m[1]);
}

function threeDSlugs() {
  const src = fs.readFileSync(path.join(ROOT, "designs/tokens.ts"), "utf8");
  return new Set([...src.matchAll(/"([\w-]+)":\s*\{[^}]*threeD:\s*true/gs)].map((m) => m[1]));
}

// ─────────────────── brand.config.ts pin/restore ───────────────────

const DESIGN_SLUG_RE = /designSlug:\s*(?:undefined|"[\w-]+")\s+as\s+string\s*\|\s*undefined,/;

function restoreBrandConfig() {
  execFileSync("git", ["checkout", "--", "brand.config.ts"], { cwd: ROOT, stdio: "ignore" });
}

function pinDesign(slug) {
  restoreBrandConfig(); // always patch from the pristine file
  const src = fs.readFileSync(BRAND_CONFIG, "utf8");
  if (!DESIGN_SLUG_RE.test(src)) {
    throw new Error("Could not locate the designSlug field in brand.config.ts — pattern drifted?");
  }
  fs.writeFileSync(
    BRAND_CONFIG,
    src.replace(
      DESIGN_SLUG_RE,
      `designSlug: "${slug}" as string | undefined, /* TEMP: capture-gallery — auto-restored */`,
    ),
  );
}

// ─────────────────────── dev server ───────────────────────

async function probe(url, timeoutMs = 3000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: "follow" });
    return res.status;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function ensureDevServer(port) {
  const url = `http://localhost:${port}/da`;
  if ((await probe(url)) !== null) {
    console.log(`• reusing dev server already running on :${port}`);
    return null;
  }
  console.log(`• no server on :${port} — spawning \`pnpm dev\` (PORT=${port})…`);
  const logPath = path.join(os.tmpdir(), `capture-gallery-dev-${port}.log`);
  const logFd = fs.openSync(logPath, "w");
  const child = spawn("pnpm", ["dev"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    detached: true, // own process group → we can kill next dev's children too
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if ((await probe(url)) === 200) {
      console.log(`• dev server is up on :${port} (log: ${logPath})`);
      return child;
    }
    await sleep(2000);
  }
  try { process.kill(-child.pid, "SIGTERM"); } catch {}
  throw new Error(`Dev server did not answer 200 on ${url} within 120s — see ${logPath}`);
}

function stopDevServer(child) {
  if (!child) return;
  try { process.kill(-child.pid, "SIGTERM"); } catch {}
  console.log("• stopped the dev server this script started");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────── capture ───────────────────────

async function settleOn(page, url) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(4000); // let the dev server recompile the new design
  await page.reload({ waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(2000); // settle (fonts, three.js mount, animations)
}

async function isErrorPage(page) {
  const text = await page.innerText("body").catch(() => "");
  return /unexpected error/i.test(text);
}

async function captureScreenshot(browser, url, outFile) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: "light",
  });
  try {
    const page = await context.newPage();
    await settleOn(page, url);
    if (await isErrorPage(page)) return false;
    await page.screenshot({ path: outFile, type: "jpeg", quality: 88 });
    return true;
  } finally {
    await context.close();
  }
}

async function captureVideo(browser, url, outDir, slug) {
  const videoTmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-gallery-video-"));
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: "light",
    recordVideo: { dir: videoTmp, size: { width: 1280, height: 800 } },
  });
  let rawWebm = null;
  try {
    const page = await context.newPage();
    await settleOn(page, url);
    if (await isErrorPage(page)) return false;
    // 60-step slow scroll to the bottom — shows off scroll-driven/3D sections.
    const distance = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    for (let i = 1; i <= 60; i++) {
      await page.evaluate((y) => window.scrollTo({ top: y }), (distance * i) / 60);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(500);
    const video = page.video();
    await context.close(); // flushes the webm to disk
    rawWebm = await video.path();
  } finally {
    // context.close() is idempotent — safe if the try block closed it already
    await context.close().catch(() => {});
  }
  // The first ~2s show the pre-scroll recompile/settle flash — trim it from both.
  const mp4 = path.join(outDir, `${slug}.mp4`);
  const webm = path.join(outDir, `${slug}.webm`);
  execFileSync("ffmpeg", [
    "-y", "-ss", "2", "-i", rawWebm,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-movflags", "+faststart",
    "-an", mp4,
  ], { stdio: "ignore" });
  execFileSync("ffmpeg", [
    "-y", "-ss", "2", "-i", rawWebm,
    "-c:v", "libvpx-vp9", "-crf", "34", "-b:v", "0",
    "-an", webm,
  ], { stdio: "ignore" });
  fs.rmSync(videoTmp, { recursive: true, force: true });
  return true;
}

// ─────────────────────── main ───────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const known = allDesignSlugs();
  const slugs = args.slugs ?? known;
  const unknown = slugs.filter((s) => !known.includes(s));
  if (unknown.length) {
    console.error(`Unknown design slug(s): ${unknown.join(", ")}\nKnown: ${known.join(", ")}`);
    process.exit(2);
  }
  const threeD = threeDSlugs();
  const outDir = path.resolve(ROOT, args.out);
  fs.mkdirSync(outDir, { recursive: true });

  const url = `http://localhost:${args.port}/da`;
  const failures = [];
  let devChild = null;
  let browser = null;

  // Restore brand.config.ts no matter how we exit (crash, ctrl-c, …).
  const cleanup = () => {
    try { restoreBrandConfig(); } catch {}
  };
  process.on("SIGINT", () => { cleanup(); stopDevServer(devChild); process.exit(130); });
  process.on("SIGTERM", () => { cleanup(); stopDevServer(devChild); process.exit(143); });

  try {
    devChild = await ensureDevServer(args.port);
    const { chromium } = await import("@playwright/test");
    browser = await chromium.launch();

    for (const slug of slugs) {
      const wantsVideo = args.video && threeD.has(slug);
      console.log(`\n▸ ${slug}${wantsVideo ? " (+video)" : ""}`);
      pinDesign(slug);
      try {
        const ok = await captureScreenshot(browser, url, path.join(outDir, `${slug}.jpg`));
        if (!ok) {
          console.error(`  FAIL ${slug}: page rendered the error page ("unexpected error") — skipped`);
          failures.push(slug);
          continue;
        }
        console.log(`  ✓ ${path.relative(ROOT, path.join(outDir, `${slug}.jpg`))}`);
        if (wantsVideo) {
          const vOk = await captureVideo(browser, url, outDir, slug);
          if (!vOk) {
            console.error(`  FAIL ${slug}: error page during video capture — video skipped`);
            failures.push(slug);
            continue;
          }
          console.log(`  ✓ ${path.relative(ROOT, path.join(outDir, `${slug}.webm`))} + .mp4 (first 2s trimmed)`);
        }
      } catch (err) {
        console.error(`  FAIL ${slug}: ${err?.message ?? err}`);
        failures.push(slug);
      }
    }
  } finally {
    cleanup(); // ← brand.config.ts back to pristine, always
    if (browser) await browser.close().catch(() => {});
    stopDevServer(devChild);
  }

  console.log(`\nDone: ${slugs.length - failures.length}/${slugs.length} captured → ${path.relative(ROOT, outDir)}/`);
  if (failures.length) {
    console.error(`Failed slugs: ${failures.join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  try { restoreBrandConfig(); } catch {}
  process.exit(1);
});
