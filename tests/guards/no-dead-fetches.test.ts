import { describe, expect, it } from "vitest";

import { lineOf, onDisk, read, stripComments, subdirs, walkCode } from "./_shared";

/**
 * STATIC — every `fetch("/api/…")` a shipped file makes must have a route.
 *
 * Owner CW-29, measured while porting a finished 8-page site into a `--profile
 * site` scaffold: `app/api/gallery`, `app/api/gallery/file/[name]` and
 * `app/api/rates` did not come along. `pnpm build` was green. `pnpm
 * audit:site-profile` said nothing, because it walks the IMPORT graph and a URL
 * string is not an import. And the site profile prunes `app/api/[...unknown]`
 * (the `mcp` module owns it), so the request fell through to
 * `app/[locale]/[...missing]/route.ts` and came back as a locale 404 page —
 * HTML, status 404, `lang="api"`. `res.json()` then threw a parse error a long
 * way from the cause.
 *
 * The same class reaches a customer from the other direction: a profile deletes
 * a route the engine's own shipped components still call. That is why this runs
 * everywhere and not only in a scaffold — in the engine nothing is missing, so
 * the guard is silent until somebody deletes a route and leaves its caller.
 *
 * WHAT IT READS. Comment-stripped source under `app/`, `components/`, `lib/`,
 * `designs/` and `plugins/` — a `fetch("/api/…")` in a docblock is an example,
 * not a call. Only root-relative `/api/…` literals: an absolute URL goes to
 * somebody else's server and is none of this guard's business.
 *
 * WHAT IT ALLOWS. `KNOWN_UNROUTED` is a ratchet, not an amnesty. Three literals
 * in the engine's own shipped components point at routes the `site` profile
 * removes; pretending otherwise would either fail this suite on day one for
 * pre-existing debt, or force the guard to be so loose it says nothing. Each
 * entry is pinned with the reason it is currently survivable, and a NEW dead
 * fetch fails by name — which is the class-closer. Removing an entry (because
 * the call got a gate, or the route joined the profile) is a welcome diff.
 * Same shape, same reasoning as `tests/unit/pruned-route-hrefs.test.ts`'s
 * `KNOWN_UNGATED`.
 */

const ROOTS = ["app", "components", "lib", "designs", "plugins"];

/** `fetch("/api/…")` and `fetch(`/api/…`)`, single or double quoted. */
const FETCH_RE = /fetch\(\s*(["'`])(\/api\/[^"'`]*)\1?/g;

type Known = { file: string; route: string; why: string };

/**
 * Literals whose route the `site` profile prunes, with the reason each is
 * survivable today. Every entry is verified against the tree below: an entry
 * naming a file that no longer exists, or a call that is no longer there, fails
 * — the ratchet cannot rot into a list of names nobody checks.
 */
const KNOWN_UNROUTED: Known[] = [
  {
    file: "components/SmartContactForm.tsx",
    route: "/api/support/triage",
    why: "gated at the call site on `profileCapabilities.supportTriage`, which is false in the static twin — the form skips triage and goes straight to the human path (#565).",
  },
  {
    file: "components/SmartContactForm.tsx",
    route: "/api/contact/upload",
    why: "reached only when `attachmentsEnabled` is passed true, which `app/[locale]/contact/page.tsx` derives from the `contactAttachments` runtime flag — a flag no database-less profile can turn on. Debt, not safety: the gate is a flag rather than a capability, so it is a runtime promise instead of a compile-time one.",
  },
  {
    file: "components/NewsletterSignup.tsx",
    route: "/api/newsletter/subscribe",
    why: "the route is owned by the `admin` module and the component is unclaimed, so the caller ships where the callee does not. Survivable only because the CLI flips `brand.features.newsletter` to false for `site` and the footer renders the component behind that flag — a customer who turns the flag back on gets CW-29 verbatim. Closing it means a capability gate in the component, which is a behaviour change and belongs in its own PR. It is not the only caller of that route: `designs/crema/LetterForm.tsx:37` makes the same ungated call and needs no entry here, because the `site` materializer deletes the whole crema pack (so the file is not walked) and `light` prunes neither the pack nor the route (so the call resolves). An earlier draft of this sentence said this was the one ungated instance; it was wrong about the tree, which is what the staleness check below exists to stop.",
  },
];

/**
 * Does `/api/a/b` have a route file? Walks `app/api` segment by segment,
 * accepting an exactly-named directory, a catch-all that claims the subtree, or
 * a single dynamic one, and requires a `route.*` at the end.
 *
 * NEITHER OF THE ENGINE'S TWO PROBLEM+JSON FALLBACKS COUNTS, and that is the
 * whole design of this function.
 *
 *   · `app/api/[...unknown]` answers every unclaimed `/api/*` path with an RFC
 *     9457 404 so an agent gets JSON instead of the HTML 404 page. Counting it
 *     would make this guard pass for every URL anyone could type — measured: a
 *     deliberately planted `fetch("/api/nope")` stayed green.
 *   · `app/api/route.ts` is the same thing one level up ("The API root is not
 *     an endpoint."), and it used to be reachable through the back door:
 *     `normalizeFetchTarget` truncates at `${`, so ``fetch(`/api/${name}`)``
 *     normalises to the bare `/api`, the segment loop runs zero times, and the
 *     fallback's own `route.ts` answered yes. Measured before the fix:
 *     `apiRouteExists("/api")` → `true`. There are no such call sites in this
 *     tree today (44 `/api/` literals, every one of them named), so this closed
 *     a hole rather than a live defect — but it is the hole where a fully
 *     dynamic endpoint would have passed while checking nothing.
 *
 * A better error message is not a route. A bare `/api` is therefore always
 * false, and the caller reports it as "unverifiable, name the segment".
 *
 * A CATCH-ALL DEEPER IN THE TREE IS A REAL HANDLER, and it is now actually
 * treated as one. The docblock has claimed this since the first draft; the code
 * did not do it. `app/api/auth` has exactly one child, `[...nextauth]`, and the
 * single-dynamic branch was tested FIRST — so the catch-all was consumed as if
 * it matched one segment, and anything beyond it fell off the end of the tree.
 * Measured: `apiRouteExists("/api/auth/callback/credentials")` → `false`, the
 * real NextAuth callback URL, while the two-segment `/api/auth/session` passed
 * by luck. The catch-all test now comes first, which is also what Next.js does:
 * `[...x]` claims one-or-more segments, `[x]` claims exactly one.
 */
export function apiRouteExists(route: string): boolean {
  const segments = route.split("/").filter(Boolean).slice(1); // drop "api"
  if (segments.length === 0) return false; // the API root is not an endpoint
  let dir = "app/api";
  for (const segment of segments) {
    const children = subdirs(dir);
    if (children.includes(segment)) {
      dir = `${dir}/${segment}`;
      continue;
    }
    const atApiRoot = dir === "app/api";
    // A catch-all below the API root claims its whole subtree — check it BEFORE
    // the single-dynamic branch, or a lone `[...x]` is mistaken for a `[x]`.
    if (!atApiRoot && children.some((c) => c.startsWith("[..."))) return true;
    const single = children.filter(
      (c) => c.startsWith("[") && c.endsWith("]") && !c.startsWith("[..."),
    );
    if (single.length === 1) {
      dir = `${dir}/${single[0]}`;
      continue;
    }
    return false;
  }
  return ["route.ts", "route.tsx", "route.js", "route.mjs"].some((f) => onDisk(`${dir}/${f}`));
}

/**
 * The literal path, with query string and template interpolation cut off.
 *
 * KNOWN AND DELIBERATE IMPRECISION, both directions. Truncating at `${` turns
 * ``fetch(`/api/admin/designs/${slug}`)`` into `/api/admin/designs`, which has
 * no root `route.ts` — so a real call would be reported dead. And a route WITH
 * a root handler swallows whatever followed the interpolation, so
 * ``/api/v1/tools/${name}/nonsense`` normalises to `/api/v1/tools` and passes.
 * Both are hypothetical in this tree, measured rather than assumed: every
 * `/api/` literal here names its path segments, and the only three template
 * literals among them (`admin/generate-video` twice, `admin/hosting` once)
 * interpolate inside the QUERY STRING — which the `?` cut removes before a `${`
 * is ever reached. Resolving further would mean evaluating the expression,
 * which a static guard cannot do. The one case that is not survivable is
 * interpolating the FIRST segment — that leaves nothing to check at all — and
 * `apiRouteExists` now refuses it by name.
 */
export function normalizeFetchTarget(literal: string): string {
  const cut = Math.min(
    ...[literal.indexOf("?"), literal.indexOf("${"), literal.indexOf("#")]
      .filter((i) => i !== -1)
      .concat([literal.length]),
  );
  return literal.slice(0, cut).replace(/\/+$/, "") || "/api";
}

type Hit = { file: string; line: number; route: string; text: string };

function collect(): Hit[] {
  const hits: Hit[] = [];
  for (const root of ROOTS) {
    for (const file of walkCode(root)) {
      const source = read(file);
      const scrubbed = stripComments(source);
      for (const match of scrubbed.matchAll(FETCH_RE)) {
        const route = normalizeFetchTarget(match[2]);
        const line = lineOf(scrubbed, match.index ?? 0);
        hits.push({ file, line, route, text: source.split("\n")[line - 1]?.trim() ?? "" });
      }
    }
  }
  return hits;
}

const hits = collect();

describe("guard: no dead fetches", () => {
  it("the walk found the shipped source roots", () => {
    const found = ROOTS.filter((r) => onDisk(r));
    expect(
      found.length,
      `None of ${ROOTS.join(", ")} exists. This guard walked nothing, so its silence means ` +
        "nothing — check that it is running from the repository root.",
    ).toBeGreaterThan(0);
  });

  it("every `fetch(\"/api/…\")` in shipped code resolves to a route on disk", () => {
    const known = new Set(KNOWN_UNROUTED.map((k) => `${k.file}::${k.route}`));
    const dead = hits.filter(
      (h) => !apiRouteExists(h.route) && !known.has(`${h.file}::${h.route}`),
    );
    const detail = dead
      .map(
        (h) =>
          `  ${h.file}:${h.line}\n      ${h.text}\n      → ` +
          (h.route === "/api"
            ? "the whole path is interpolated, so there is nothing to resolve. " +
              "`app/api/route.ts` is the problem+json fallback, not a handler for this call — " +
              "name the first segment, or gate the call."
            : `no app${h.route}/route.ts`),
      )
      .join("\n");
    expect(
      dead.map((h) => `${h.file}:${h.line} ${h.route}`),
      dead.length
        ? `\n${dead.length} call${dead.length === 1 ? "" : "s"} to an API route this tree does ` +
            `not have:\n\n${detail}\n\n` +
            "This is owner CW-29. The build does not catch it (a URL is a string) and the " +
            "import audit does not catch it (a URL is not an import). At runtime the request " +
            "reaches `app/api/[...unknown]` and gets a problem+json 404 where this tree still " +
            "has it — and in a profile that pruned that catch-all it falls through to the " +
            "locale route and comes back as an HTML 404 page, so `res.json()` throws a parse " +
            "error a long way from the cause. Either bring " +
            `\`app/api/…/route.ts\` along, or gate the call so the profile without the route ` +
            "never makes it.\n"
        : "",
    ).toEqual([]);
  });

  it("every ratchet entry still describes this tree", () => {
    const stale: string[] = [];
    for (const entry of KNOWN_UNROUTED) {
      if (!onDisk(entry.file)) {
        stale.push(`  ${entry.file} — file is gone; drop the entry.`);
        continue;
      }
      const present = hits.some((h) => h.file === entry.file && h.route === entry.route);
      if (!present) {
        stale.push(
          `  ${entry.file} no longer calls ${entry.route} — drop the entry so the next ` +
            "dead fetch to that route fails instead of being pre-forgiven.",
        );
      }
    }
    expect(
      stale,
      stale.length ? `\nThe known-unrouted ratchet has rotted:\n\n${stale.join("\n")}\n` : "",
    ).toEqual([]);
  });

  it("every ratchet entry carries an argument, not a name", () => {
    const thin = KNOWN_UNROUTED.filter((k) => k.why.length <= 40).map((k) => k.file);
    expect(
      thin,
      "A known-unrouted entry needs a reason long enough to argue with — otherwise the " +
        "ratchet becomes a list of files somebody once decided not to look at.",
    ).toEqual([]);
  });
});
