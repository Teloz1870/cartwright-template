import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * `stripe` is pinned EXACTLY in package.json (no `^`/`~`) — the one dependency
 * whose minor bumps are not drop-in here. package.json cannot carry a comment,
 * so the rationale lives in this test.
 *
 * The coupling: `lib/stripe.ts` constructs the client with
 * `apiVersion: "2026-07-29.dahlia"`, and the SDK types that option as
 * `LatestApiVersion` (node_modules/stripe/esm/lib.d.ts) — a literal that every
 * stripe release moves to its own API version (esm/apiVersion.d.ts). stripe
 * 22.6+ and the 23.0.0 major therefore change the typed union, and a caret
 * range lets `pnpm update` — or a scaffold installed without a lockfile — pull
 * a release that fails `tsc` on that one line. Bumping stripe is a deliberate
 * two-file change: the pin here AND the apiVersion in lib/stripe.ts
 * (owner choice 2026-09-16, backlog STRIPE1-a).
 *
 * A scaffold that pruned the commerce module has neither the dependency nor
 * lib/stripe.ts, so the suite is skipped there rather than failing.
 */
const ROOT = path.resolve(__dirname, "../..");
const STRIPE_TS = path.join(ROOT, "lib/stripe.ts");

const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
};

describe.skipIf(!existsSync(STRIPE_TS))("stripe dependency pin", () => {
  it("package.json pins stripe to an exact version (no ^ or ~ range)", () => {
    const spec = pkg.dependencies?.stripe;
    expect(spec, "stripe must be a production dependency").toBeTypeOf("string");
    expect(spec, "a range would let pnpm update move the typed apiVersion").toMatch(
      /^\d+\.\d+\.\d+$/,
    );
  });

  it("lib/stripe.ts pins the apiVersion the installed SDK declares", () => {
    const pinned = /apiVersion:\s*"([^"]+)"/.exec(readFileSync(STRIPE_TS, "utf8"))?.[1];
    expect(pinned, "lib/stripe.ts must pin apiVersion").toBeTruthy();

    const declared = /ApiVersion = "([^"]+)"/.exec(
      readFileSync(path.join(ROOT, "node_modules/stripe/esm/apiVersion.d.ts"), "utf8"),
    )?.[1];
    expect(declared, "the installed stripe must declare its ApiVersion").toBeTruthy();
    expect(pinned, "bump the apiVersion in lib/stripe.ts together with the pin").toBe(declared);
  });
});
