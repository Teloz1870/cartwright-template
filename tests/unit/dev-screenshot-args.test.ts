import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import {
  KNOWN_FLAGS,
  isInvokedDirectly,
  parseArgs,
  summaryLines,
} from "../../scripts/dev-screenshot.mjs";

/**
 * `scripts/dev-screenshot.mjs` is `pnpm verify:design` — the gate DESIGN.md §4
 * and docs/agents-quickstart.md tell humans and agents to run before calling a
 * design done. It shipped 208 lines of argument and announcement logic with no
 * test at all, and the two rules that matter are precisely the ones a reader
 * cannot verify by looking at a screenshot:
 *
 *   1. a flag must never be silently dropped (you would gate on an artefact you
 *      did not ask for), and
 *   2. `--selector` mode must SAY that it skipped the page-level checks, on
 *      every run — an unannounced skip is indistinguishable from a pass.
 *
 * Both are pure functions in that file for exactly this reason. The module is
 * import-safe: its `main()` runs only when argv[1] is the script itself, so
 * importing it here launches no browser.
 */
describe("parseArgs — flags never consume the [path] [port] positionals", () => {
  it("accepts flags before, between and after the positionals", () => {
    for (const argv of [
      ["--full-page", "/en/products", "3999"],
      ["/en/products", "--full-page", "3999"],
      ["/en/products", "3999", "--full-page"],
    ]) {
      const { flags, positionals } = parseArgs(argv);
      expect(flags.get("full-page")).toBe(true);
      // Order is load-bearing: positionals[0] is the path, [1] is the port.
      expect(positionals).toEqual(["/en/products", "3999"]);
    }
  });

  it("keeps --selector's value out of the positionals", () => {
    const { flags, positionals } = parseArgs(["--selector", "#calculator", "/en/quote", "3002"]);
    expect(flags.get("selector")).toBe("#calculator");
    expect(positionals).toEqual(["/en/quote", "3002"]);
  });

  it("accepts the --selector=#x form", () => {
    expect(parseArgs(["--selector=#calculator"]).flags.get("selector")).toBe("#calculator");
  });

  it("accepts --full as the capture-locales.mjs spelling", () => {
    // Dropping this alias would turn a sibling script's habit into a hard error.
    expect(KNOWN_FLAGS.has("full")).toBe(true);
    expect(parseArgs(["--full"]).flags.get("full")).toBe(true);
  });

  it("treats a LEADING `--` as pnpm's separator, not as passthrough", () => {
    // `pnpm verify:design -- --full-page` forwards the marker, so consuming it
    // is what makes the conventional invocation work. Passthrough moves to the
    // second `--` (covered below).
    const { flags, positionals } = parseArgs(["--", "--full-page"]);
    expect(flags.get("full-page")).toBe(true);
    expect(positionals).toEqual([]);
  });
});

describe("parseArgs — a malformed argument stops the run, never degrades it", () => {
  it.each([
    ["an unknown flag", ["--fullpage"], /unknown option/],
    ["--selector with no value", ["--selector"], /needs a value/],
    ["--selector swallowing the next flag", ["--selector", "--full-page"], /needs a value/],
    // Without this, `--full-page=false` sets the flag to TRUE and captures the
    // opposite of what was asked for.
    ["a value on a boolean flag", ["--full-page=false"], /takes no value/],
    ["--full alias with a value", ["--full=0"], /takes no value/],
    // An element capture has no fullPage notion, so one of the two would be
    // silently ignored.
    ["--full-page with --selector", ["--full-page", "--selector", "#x"], /mutually exclusive/],
  ])("refuses %s", (_label, argv, message) => {
    expect(() => parseArgs(argv)).toThrow(message);
  });
});

describe("summaryLines — the --selector skip is announced on EVERY selector run", () => {
  const SKIP = /page-level checks .* skipped in --selector mode/;

  it.each([
    ["both viewports captured", ["1440", "390"], [] as string[]],
    ["desktop-only component", ["1440"], ["390"]],
    // The regression this test exists for: the announcement used to live inside
    // the viewport loop under `label === "1440"`, and a mobile-only component
    // never reaches that iteration — so the run ended in a bare
    // "Checks passed." with no statement that overflow and <h1> never ran.
    ["mobile-only component", ["390"], ["1440"]],
  ])("announces it when %s", (_label, captured, missed) => {
    const { log } = summaryLines({
      selector: "#calculator",
      captured,
      missed,
      violations: 0,
      url: "http://localhost:3000/",
    });
    expect(log.filter((l: string) => SKIP.test(l))).toHaveLength(1);
  });

  it("says which viewports the element was missing from", () => {
    const { log } = summaryLines({
      selector: "#calculator",
      captured: ["390"],
      missed: ["1440"],
      violations: 0,
      url: "http://localhost:3000/",
    });
    expect(log.join("\n")).toContain("Captured at 390px; not present at 1440px.");
  });

  it("never announces a skip that did not happen", () => {
    const { log, exitCode } = summaryLines({
      selector: null,
      captured: ["1440", "390"],
      missed: [],
      violations: 0,
      url: "http://localhost:3000/",
    });
    expect(log.some((l: string) => SKIP.test(l))).toBe(false);
    expect(exitCode).toBe(0);
  });
});

describe("summaryLines — a violation is never reported as a pass", () => {
  it("exits non-zero and withholds the pass line", () => {
    const { log, error, exitCode } = summaryLines({
      selector: null,
      captured: ["1440", "390"],
      missed: [],
      violations: 2,
      url: "http://localhost:3000/en",
    });
    expect(exitCode).toBe(1);
    expect(log.some((l: string) => l.includes("Checks passed"))).toBe(false);
    expect(error.join("\n")).toContain("2 violation(s) on http://localhost:3000/en");
  });

  it("still announces the selector skip when the page also failed", () => {
    const { log } = summaryLines({
      selector: "#calculator",
      captured: ["1440"],
      missed: ["390"],
      violations: 1,
      url: "http://localhost:3000/",
    });
    expect(log.some((l: string) => /skipped in --selector mode/.test(l))).toBe(true);
  });
});


describe("parseArgs — the package-manager separator does not eat the flags", () => {
  it("consumes a LEADING `--` (pnpm forwards it) and still sees the flag", () => {
    // Measured: `pnpm verify:design -- /en 3000 --full-page` runs
    // `node scripts/dev-screenshot.mjs -- /en 3000 --full-page`. Treating that
    // first `--` as POSIX passthrough made --full-page a third positional that
    // main() never reads, so an ordinary viewport capture reported success.
    const { flags, positionals } = parseArgs(["--", "/en", "3000", "--full-page"]);
    expect(flags.get("full-page")).toBe(true);
    expect(positionals).toEqual(["/en", "3000"]);
  });

  it("keeps passthrough for a SECOND `--`, so a --prefixed path is still expressible", () => {
    expect(parseArgs(["--", "--", "--weird"]).positionals).toEqual(["--weird"]);
  });

  it("refuses a third positional rather than ignoring it", () => {
    // main() reads [path] and [port] and nothing else.
    expect(() => parseArgs(["/en", "3000", "extra"])).toThrow(/too many arguments/);
  });

  it("refuses a repeated flag rather than keeping the last value", () => {
    expect(() => parseArgs(["--selector", "#first", "--selector", "#second"])).toThrow(
      /given more than once/,
    );
  });
});

describe("isInvokedDirectly — a symlinked path must not turn the gate into a no-op", () => {
  const dir = mkdtempSync(join(tmpdir(), "verify-design-guard-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const script = resolve(__dirname, "../../scripts/dev-screenshot.mjs");
  const moduleUrl = pathToFileURL(script).href;

  it("recognises the script through a symlink to it", () => {
    // The ESM loader canonicalises import.meta.url through symlinks; path.resolve
    // does not. Comparing the two raw made `node <abs-path>/dev-screenshot.mjs`
    // print NOTHING and exit 0 whenever the path crossed a symlink — on macOS
    // /tmp is one. A gate that silently does nothing is worse than a broken gate.
    const link = join(dir, "linked-dev-screenshot.mjs");
    symlinkSync(script, link);

    expect(isInvokedDirectly(link, moduleUrl)).toBe(true);
    // ...and the naive comparison this replaced would have said no:
    expect(moduleUrl === pathToFileURL(link).href).toBe(false);
  });

  it("still says no for an unrelated entry point (vitest's own, e.g.)", () => {
    expect(isInvokedDirectly(join(dir, "..", "somewhere-else.mjs"), moduleUrl)).toBe(false);
    expect(isInvokedDirectly(undefined, moduleUrl)).toBe(false);
  });
});

describe("summaryLines — never formats a pass out of an empty capture", () => {
  it("omits the captured/missing line when nothing was captured", () => {
    // main() throws before reaching the summary in this state, but the function
    // is exported and must not be able to render "Captured at px".
    const { log } = summaryLines({
      selector: "#calculator",
      captured: [],
      missed: ["1440", "390"],
      violations: 0,
      url: "http://localhost:3000/",
    });
    expect(log.join("\n")).not.toContain("Captured at px");
  });
});
