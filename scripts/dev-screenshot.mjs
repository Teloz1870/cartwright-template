/**
 * pnpm verify:design [path] [port] [--full-page] [--selector <css>]
 *   (canonical — `pnpm dev:screenshot` is the same script)
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
 * Flags (order-independent; they never consume the [path]/[port] positionals):
 *   --full-page        capture the whole scroll length, not just the viewport.
 *                      The default viewport shot proves the hero; it is blind
 *                      to every calculator, form and footer below the fold.
 *   --selector <css>   capture just that element (first match). For components
 *                      under the fold whose detail a full-page shot renders too
 *                      small to judge.
 *
 *   pnpm verify:design /en/quote --full-page
 *   pnpm verify:design /en/quote --selector "#calculator"
 *
 * Files are suffixed so the modes never overwrite each other:
 * `<slug>-<width>.png`, `-full`, `-el`. Two DIFFERENT selectors on one path DO
 * share the `-el` slot, so each run deletes the artefact it is about to
 * (re)write: a viewport that gets skipped must not leave the previous run's
 * element sitting there for you to "LOOK at".
 *
 * NOTE --selector SKIPS the overflow and single-<h1> checks: both are
 * assertions about the PAGE, and the artefact here is one component. The skip
 * is printed once in the summary of every run that reaches one — NOT per
 * viewport, because the
 * viewport that would have printed it is exactly the one a mobile-only
 * component is missing from, and an unannounced skip looks exactly like a pass.
 * Run without --selector to gate the page itself.
 *
 * A selector absent (or invisible) at ONE viewport is reported and skipped, not
 * failed: breakpoint-gated components are normal, and hard-failing at 390px
 * would make this flag unusable for the responsive work it exists to verify.
 * Matching at NO viewport IS a failure — nothing was captured, so nothing was
 * verified. It never falls back to a viewport shot.
 *
 * Argument handling is strict, because the worst thing a verification gate can
 * do is look like it passed: an unknown flag (`--fullpage`), a value on a
 * boolean flag (`--full-page=false`, which would otherwise read as TRUE), a
 * `--selector` with no value, and `--full-page` combined with `--selector`
 * (the element shot has no fullPage notion, so one of them would be silently
 * dropped) all stop the run. `--full` is accepted as an alias because the
 * sibling capture-locales.mjs trains that spelling, and `--selector=#x` is
 * accepted as an ordinary `=` form.
 *
 * Every mode walks the document first so `loading="lazy"` images have fired
 * (this costs the default capture a second or two on a long page). `--full-page` additionally emulates `prefers-reduced-motion: reduce`
 * (announced on the run): this engine's scroll-driven reveals live inside
 * `@media (prefers-reduced-motion: no-preference)` in themes/motion.css, and a
 * fullPage capture does not scroll — so without it every below-the-fold reveal
 * is photographed at its pre-entry keyframe (often opacity: 0) in an artefact
 * that claims to show the whole page.
 *
 * Requires the dev server to already be running — it never starts one.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const KNOWN_FLAGS = new Set(["full-page", "full", "selector"]);
const VALUE_FLAGS = new Set(["selector"]);

/** Thrown for a malformed argv. Carries the multi-line operator message. */
export class ArgError extends Error {}

/**
 * True when this module is the process entry point.
 *
 * Exported so the symlink case above is testable: a guard that silently
 * answers "no" turns the whole gate into an exit-0 no-op.
 */
export function isInvokedDirectly(entry = process.argv[1], moduleUrl = import.meta.url) {
  if (!entry) return false;
  try {
    return moduleUrl === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

/**
 * Parse argv strictly into `{ flags, positionals }`.
 *
 * Flags are stripped BEFORE the positionals are read, so the documented
 * `verify:design [path] [port]` shape keeps working in any order:
 *   verify:design /en/products --full-page
 *   verify:design --selector "#calculator" /en/quote 3002
 *
 * Exported (and pure — it throws instead of exiting) so the rules above are
 * unit-testable without launching a browser.
 */
export function parseArgs(argv) {
  const flags = new Map();
  const positionals = [];

  // `pnpm verify:design -- /en --full-page` FORWARDS the separator: pnpm runs
  // `node scripts/dev-screenshot.mjs -- /en --full-page` (measured). Without
  // this, the POSIX passthrough below swallowed `--full-page` as a third
  // positional, main() read only the first two, and an ordinary viewport
  // capture reported success for a flag the caller had asked for — the silent
  // drop this parser exists to refuse, reached by the most conventional
  // invocation there is. A LATER `--` keeps its passthrough meaning, so a path
  // that really starts with `--` is still expressible as `-- -- --weird`.
  const args = argv[0] === "--" ? argv.slice(1) : argv;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const eq = arg.indexOf("=");
    const name = (eq === -1 ? arg.slice(2) : arg.slice(2, eq)).trim();
    if (!KNOWN_FLAGS.has(name)) {
      const known = [...KNOWN_FLAGS].map((f) => `--${f}`).join(", ");
      throw new ArgError(
        `unknown option "${arg}". Known: ${known}\n` +
          "  (an unknown flag is refused, not ignored — a silently\n" +
          "   dropped option would make this gate report a pass for a\n" +
          "   capture you did not ask for)",
      );
    }

    if (VALUE_FLAGS.has(name)) {
      const value = eq === -1 ? args[++i] : arg.slice(eq + 1);
      if (!value || value.startsWith("--")) {
        throw new ArgError(`--${name} needs a value, e.g. --selector "#calculator"`);
      }
      flags.set(name, value);
    } else if (eq !== -1) {
      // `--full-page=false` would otherwise set the flag to TRUE and capture
      // the opposite of what the caller asked for — the same silent-drop class
      // the unknown-flag branch above exists to refuse.
      throw new ArgError(
        `--${name} takes no value (got "${arg}") — pass it bare, or omit it entirely`,
      );
    } else {
      flags.set(name, true);
    }
  }

  // A repeated flag used to keep the LAST value and drop the earlier one
  // without a word — the same silent-drop class as everything above.
  const seen = new Set();
  for (const arg of args) {
    if (!arg.startsWith("--") || arg === "--") continue;
    const eq = arg.indexOf("=");
    const name = (eq === -1 ? arg.slice(2) : arg.slice(2, eq)).trim();
    if (!KNOWN_FLAGS.has(name)) continue;
    if (seen.has(name)) {
      throw new ArgError(`--${name} given more than once — the earlier value would be dropped silently`);
    }
    seen.add(name);
  }

  // main() reads positionals[0] (path) and [1] (port) and nothing else, so a
  // third one is a token that would vanish. Refuse it rather than verify a
  // target the caller did not name.
  if (positionals.length > 2) {
    throw new ArgError(
      `too many arguments (${positionals.join(" ")}) — the shape is [path] [port], ` +
        "and anything past the port would be silently ignored",
    );
  }

  if (flags.get("selector") && (flags.has("full-page") || flags.has("full"))) {
    throw new ArgError(
      "--full-page and --selector are mutually exclusive: an element capture has no\n" +
        "  fullPage notion, so one of the two would be silently ignored",
    );
  }

  return { flags, positionals };
}

/**
 * The end-of-run summary — pure, so the announcement rules are testable.
 *
 * The `--selector` skip line is emitted for EVERY selector run, whatever the
 * per-viewport outcome was. It used to be printed inside the viewport loop
 * under `label === "1440"`, which meant a component that only exists at 390px
 * (a mobile drawer, a `hidden lg:hidden` calculator) ended in a bare
 * "Checks passed." with no statement that overflow and <h1> were never
 * evaluated — the precise failure this script exists to prevent.
 */
export function summaryLines({ selector, captured, missed, violations, url }) {
  const log = [];
  const error = [];

  if (selector) {
    log.push(
      "  … page-level checks (overflow, single <h1>) skipped in --selector mode — run without it to gate the page",
    );
    if (missed.length > 0 && captured.length > 0) {
      log.push(`\nCaptured at ${captured.join(", ")}px; not present at ${missed.join(", ")}px.`);
    }
  }

  if (violations > 0) {
    error.push(`\n✗ ${violations} violation(s) on ${url} — fix, re-run, then LOOK at the screenshots.`);
    return { log, error, exitCode: 1 };
  }
  log.push("\nChecks passed. Now LOOK at the screenshots (DESIGN.md §4) — capturing is not verifying.");
  return { log, error, exitCode: 0 };
}

async function main() {
  const { flags, positionals } = parseArgs(process.argv.slice(2));

  const FULL_PAGE = flags.has("full-page") || flags.has("full");
  const SELECTOR = flags.get("selector") ?? null;

  const argPath = positionals[0];
  const argPort = positionals[1] || process.env.PORT;

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
  /** Which viewports produced an artefact, and which were skipped as breakpoint-gated. */
  const capturedViewports = [];
  const missedViewports = [];

  if (FULL_PAGE) {
    console.log(
      "  … emulating prefers-reduced-motion: reduce for the full-page capture — scroll-driven\n" +
        "    reveals are photographed at their static, visible state instead of pre-entry",
    );
  }

  const browser = await chromium.launch();
  try {
    for (const [label, width, height] of [
      ["1440", 1440, 900],
      ["390", 390, 844],
    ]) {
      const page = await browser.newPage({
        viewport: { width, height },
        colorScheme: "light",
        // themes/motion.css gates every reveal on
        // `@media (prefers-reduced-motion: no-preference)`, so `reduce` leaves
        // below-the-fold content at its natural, visible state — which is what
        // a non-scrolling fullPage capture can actually photograph.
        ...(FULL_PAGE ? { reducedMotion: "reduce" } : {}),
      });
      const res = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
      if (!res || res.status() >= 400) {
        // `throw`, never process.exit: exiting here skips the `finally` below and
        // leaks the Chromium process (Node does not run finally on process.exit).
        throw new Error(
          `${url} → HTTP ${res?.status() ?? "no response"} — is the dev server running?`,
        );
      }
      await page.waitForTimeout(2_000); // entrance animations settle

      // Walk the whole document before capturing ANY mode.
      //
      // fullPage:true expands the capture without ever scrolling, and
      // locator.screenshot() scrolls its target into view and shoots immediately.
      // Neither fires the progressive intersection events that `loading="lazy"`
      // images depend on, so below-the-fold imagery lands blank in an artefact
      // that claims to show the whole page. Scroll down in steps, let the
      // network settle, and return to the top so the capture starts from a
      // stable origin. (Scroll-driven REVEALS are handled by the
      // reduced-motion emulation above, not by this walk: an
      // `animation-timeline: view()` element is bound to its live scroll
      // position and returns to its pre-entry keyframe the moment we come back
      // to the top.)
      await page.evaluate(async () => {
        const step = Math.floor(window.innerHeight * 0.8);
        for (let y = 0; y < document.body.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 120));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(400);

      const suffix = SELECTOR ? `-el` : FULL_PAGE ? `-full` : "";
      const file = `.screenshots/${slug}-${label}${suffix}.png`;
      // Claim the slot before deciding whether we can fill it: a skipped
      // viewport that left the previous run's artefact in place is a picture of
      // a different element under a filename this run just told you to look at.
      rmSync(file, { force: true });

      if (SELECTOR) {
        const el = page.locator(SELECTOR).first();
        const count = await el.count();
        // Geometry alone is not visibility: `visibility: hidden` keeps a full
        // bounding box (designs/drive/drv.css:359 does exactly this to
        // `.drv__nav-side--left` at mobile width), so a box-only check called
        // it visible and locator.screenshot() then waited for visibility and
        // failed the whole run — where a recorded skip was the intent.
        const box = count > 0 ? await el.boundingBox() : null;
        const shown = count > 0 ? await el.isVisible() : false;
        const visible = Boolean(shown && box && box.width > 0 && box.height > 0);

        if (!visible) {
          // NOT a failure on its own. Breakpoint-gated components are normal
          // (`hidden md:block`, a mobile-only drawer), so hard-failing the run at
          // 390px would make this flag unusable for exactly the responsive work
          // it is meant to verify. Record it, say it plainly, and decide at the
          // end — a selector that matched at NO viewport is the real error.
          missedViewports.push(label);
          console.log(
            count === 0
              ? `  – ${label}px: no element matches ${SELECTOR} — skipped (breakpoint-gated?)`
              : `  – ${label}px: ${SELECTOR} has no visible box — skipped (hidden at this width?)`,
          );
          await page.close();
          continue;
        }

        // Bring it into view and let any view-triggered animation finish BEFORE
        // the capture, rather than letting locator.screenshot() scroll and shoot
        // in the same tick.
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(600);
        await el.screenshot({ path: file });
        capturedViewports.push(label);
      } else {
        await page.screenshot({ path: file, fullPage: FULL_PAGE });
        capturedViewports.push(label);
      }

      console.log(`✓ ${file}`);

      // The two checks below are DOCUMENT-level assertions ("this page has one
      // h1", "this page does not scroll sideways"). In --selector mode the
      // artefact is one component, so running them would report violations the
      // capture cannot show and is not about. Skipping is correct; announcing
      // the skip is mandatory and happens once, in summaryLines().
      if (!SELECTOR) {
        const { overflow, h1Count } = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          h1Count: document.querySelectorAll("h1").length,
        }));
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
      }
      await page.close();
    }
    if (SELECTOR && capturedViewports.length === 0) {
      throw new Error(
        `no element matched ${SELECTOR} at ANY viewport (${missedViewports.join(", ")}) on ${url} — ` +
          `nothing was captured, so nothing was verified`,
      );
    }
    const { log, error, exitCode } = summaryLines({
      selector: SELECTOR,
      captured: capturedViewports,
      missed: missedViewports,
      violations,
      url,
    });
    for (const line of log) console.log(line);
    for (const line of error) console.error(line);
    if (exitCode !== 0) process.exitCode = exitCode;
  } finally {
    await browser.close();
  }
}

// Only run when invoked as a script — importing this module (the unit tests do)
// must not launch a browser or read argv.
// realpathSync, not the raw argv: the ESM loader canonicalises import.meta.url
// through symlinks while path.resolve() does not, so on macOS (/tmp -> /private/tmp)
// or any symlinked workspace `node <abs-path>/scripts/dev-screenshot.mjs` compared
// unequal, main() never ran, and this gate printed NOTHING and exited 0 — a
// verification tool reporting success for work it did not do. Measured, and a
// regression against the base script, which had no guard and always ran.
if (isInvokedDirectly()) {
  try {
    await main();
  } catch (err) {
    // Every failure path lands here so `finally` above always closed the browser.
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
