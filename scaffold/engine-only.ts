/**
 * The scaffold ownership ledger: what is OURS and what is the CUSTOMER'S.
 *
 * A module claim is an exclusion list — "delete this when the profile does not
 * include me". It has no word for a file that belongs to **no** profile,
 * because it belongs to the engine's own repository. Everything unclaimed
 * therefore ships everywhere, and that default is how Cartwright's own
 * marketing site ended up live on a fifteen-year-old's travel blog: measured
 * on a real `create-cartwright@2.9.4 --profile site` scaffold, `/da/cartwright`
 * ("Cartwright 3.0 Engine"), `/da/changelog`, `/da/about` and `/da/privacy`
 * answered 200 on the customer's domain, wrapped in her navigation and her
 * title template, and `llms.txt` advertised `/cartwright` to AI crawlers
 * (owner backlog CW-23; our W19/W38).
 *
 * Two lists, one meaning each:
 *
 *  - `ENGINE_ONLY` — ours. It ships in this repository and in the public
 *    template mirror (cartwright.app reads `CHANGELOG.md` from the mirror), and
 *    the CLI is to delete it from a customer's scaffold. IT DOES NOT YET: no
 *    released `create-cartwright` reads `engineOnly` at all (verified against
 *    2.9.5, the version published the day this landed), so today this list is
 *    a declaration the ENGINE can be gated on, and the deletion is B4. The
 *    gating is the half that has to come first, because deleting must be safe:
 *    every href to an `ENGINE_ONLY` route in a file that DOES ship has to be
 *    gated on `profileCapabilities.engineMarketing`, which
 *    `tests/unit/pruned-route-hrefs.test.ts` derives rather than lists. The
 *    second half of that safety — the capability reaching every profile and
 *    not just `site` — is `ENGINE_ONLY_PENDING_PROFILES` below.
 *  - `SHIPS_EVERYWHERE` — the customer's, deliberately. These are unclaimed on
 *    purpose, and saying so out loud is the point: the inversion test in
 *    `tests/unit/scaffold-ownership.test.ts` treats "unclaimed" as an error, so
 *    without this list a shipped-on-purpose file is indistinguishable from one
 *    nobody thought about. That is exactly the distinction the manifest could
 *    not express before.
 *
 * Neither list is a module. Modules are profile-selectable; these two are not —
 * `ENGINE_ONLY` is never in a customer's tree and `SHIPS_EVERYWHERE` is always
 * in it. Modelling them as modules would have made "always" and "never"
 * pretend to be choices.
 *
 * Adding a path here is enough: `scripts/gen-scaffold-manifest.ts` emits both
 * fields into `scaffold/manifest.json`, and the CLI reads them from the
 * template snapshot. Do not copy either list anywhere — one list, one owner
 * (the same rule as `scaffold/site-pruned-scripts.ts`).
 *
 * The generator emits a THIRD field, `engineOnlyGate`, carrying
 * `ENGINE_ONLY_PENDING_PROFILES` and the capability it is about. That is not
 * decoration: `engineOnly` is a hazard that crosses into another repository,
 * and its safety condition has to cross with it or the CLI half gets the
 * instruction without the caveat.
 */

/**
 * The `create-cartwright` release that will actually perform the deletion —
 * `null` once it has shipped.
 *
 * This exists because the engine cannot see the CLI, and the gap between them
 * is exactly where a shipped sentence goes false. `docs/simple-site.md` told a
 * customer that "the scaffolder removes them", and offered the reader who found
 * `/cartwright` in their project the diagnosis that their engine was too OLD —
 * when in fact the ledger is new and their CLI is old. Both files reach the
 * customer's repository; the doc was wrong in the direction that stops them
 * fixing it.
 *
 * So the rule, checked in `tests/unit/scaffold-ownership.test.ts`: while this
 * is non-null, every shipped document that NAMES the ledger must also name this
 * release. A section that promises the deletion cannot lose the sentence saying
 * when it starts being true without the suite going red. Setting this to `null`
 * (B4 shipped) lifts the obligation in one edit.
 *
 * THE OTHER HALF OF THE HANDSHAKE, FOR WHOEVER WRITES B4. Deleting the paths is
 * not enough on its own: `tests/guards/marketing-routes-absent.test.ts` ships
 * into the customer's repository and runs on their `pnpm test`, and it cannot
 * hard-fail on a scaffold cut by a CLI that never promised to prune — that
 * would paint the release scaffold gate permanently red. So it is a ratchet,
 * and the CLI arms it: after the prune pass, write
 *
 *     "engineOnlyPruned": true
 *
 * into `.cartwright/profile.json`, next to `profile` and `generatedBy` (an
 * array of the removed paths is accepted too). Until that field appears the
 * guard warns and reports PENDING; the moment it does, any surviving ledger
 * path is a hard failure. One field, written once, in both the materializer and
 * `applyLightProfile`.
 */
export const ENGINE_ONLY_CLI_RELEASE: string | null = "2.10";

export type LedgerEntry = {
  /** Repo-relative path. A directory covers everything under it. */
  path: string;
  /** Why, in a sentence a stranger can check. Pinned to > 40 characters. */
  reason: string;
};

/**
 * Ours. The CLI is to delete each of these from a customer's scaffold — B4,
 * not today (see the header). The engine tree and the public mirror keep them.
 *
 * This list once carried three engine build-night reports as well, written when
 * mirror-exclusion had not landed and the inversion test still needed an owner
 * for every repo-root document. #574 landed it: the exclude list now keeps them
 * out of the template entirely, `verdict(…, { allowMirror: true })` accepts
 * that as ownership, and `tests/unit/repo-hygiene.test.ts` forbids a SHIPPED
 * file — which this one is — from even naming a mirror-excluded path. Two
 * mechanisms for one fact, and the ledger was the redundant one, so the entries
 * are gone. Removing them was a deliberate edit to the pinned length below,
 * which is the point of pinning it.
 */
export const ENGINE_ONLY: readonly LedgerEntry[] = [
  {
    path: "app/[locale]/cartwright",
    reason:
      "Cartwright's own product page. It answered 200 on a customer's domain under her navigation and her title template, and llms.txt advertised it to crawlers (owner CW-23).",
  },
  {
    path: "app/[locale]/priser",
    reason:
      "The price list for OUR product, in Danish, quoting our plans — a customer who ships it is quoting our prices to her visitors (owner CW-23).",
  },
  {
    path: "app/[locale]/cases",
    reason:
      "Our customer case studies, including a client logo wall. Nothing in it is true of the shop that would be serving it (owner CW-23).",
  },
  {
    path: "app/[locale]/start",
    reason:
      "Our own onboarding funnel — the page that asks a visitor to start building with Cartwright, not to buy anything from the shop hosting it.",
  },
  {
    path: "app/[locale]/changelog",
    reason:
      "The engine's public release log. Owner decision 2026-09-07 (CW-23): our history must never appear in a customer's scaffold, so the route goes with the file it reads.",
  },
  {
    path: "app/[locale]/built-with-cartwright",
    reason:
      "The referral tour of the ENGINE's feature set. Owner decision 2026-09-07 (CW-23): opt-in, not shipped-and-deletable — cartwrightBadge stays a Cartwright/canary flag.",
  },
  {
    path: "app/manifest",
    reason:
      "The locale-less capability manifest for the engine — it links /contact, /api/v1/tools and /changelog, and described Cartwright to anyone who found it on a customer's domain (owner CW-23).",
  },
  {
    path: "CHANGELOG.md",
    reason:
      "The engine's release history. cartwright.app reads it FROM THE MIRROR, so it must not be mirror-excluded — it is the scaffold, not the mirror, that has no use for it.",
  },
  {
    path: ".github/ISSUE_TEMPLATE",
    reason:
      "Issue forms that route a reporter to Teloz1870/cartwright. In a customer's repository they file our bugs against their own project.",
  },
  {
    path: ".github/PULL_REQUEST_TEMPLATE.md",
    reason:
      "Our review checklist — it names the three canaries and the smoke script, neither of which exists in a customer's repository.",
  },
];

/**
 * WHERE THE LEDGER AND THE INTERLOCK DISAGREE — B4's second obligation.
 *
 * `ENGINE_ONLY` is profile-independent: no customer scaffold, of any profile.
 * The interlock that makes deleting it safe is not. `profileCapabilities`
 * reaches a scaffold through a seam that the `mcp` module PROVIDES, and only a
 * profile without `mcp` gets the false twin — which today means `site` alone.
 * Every profile listed here includes `mcp`, keeps the engine tree's all-true
 * file, and would therefore link seven deleted routes the day B4 removes them
 * without also flipping `engineMarketing`. `light` is an alias of
 * `managed-site` and is the CLI's default profile, so this is the default case,
 * not an exotic one.
 *
 * Pinned rather than derived at the call site so the gap cannot change shape in
 * silence: `tests/unit/scaffold-ownership.test.ts` recomputes the same set from
 * the module graph in `modules/registry.ts` — the manifest's own source, which
 * `tests/unit/scaffold-manifest.test.ts` drift-gates the committed JSON against
 * — and fails by name if a new profile appears, if `site` gains `mcp`, or if
 * the seam's provider moves. Emptying this list is the receipt that B4 is done
 * — nothing else is.
 *
 * IT ALSO LEAVES THIS REPOSITORY. `scripts/gen-scaffold-manifest.ts` emits it
 * as `engineOnlyGate.pendingProfiles` in `scaffold/manifest.json`, next to the
 * `engineOnly` list it guards, because the CLI that will act on that list reads
 * the JSON and never sees this file.
 */
export const ENGINE_ONLY_PENDING_PROFILES: readonly string[] = [
  "agentic",
  "commerce",
  "managed-site",
];

/**
 * The customer's, deliberately unclaimed. Every profile keeps these; the list
 * exists so that "unclaimed" can be an error everywhere else.
 */
export const SHIPS_EVERYWHERE: readonly LedgerEntry[] = [
  {
    path: "app/[locale]/llms.txt",
    reason:
      "The shop's OWN agent-readable index. Its content is generated from the shop's brand and its routes; only the engine's entries inside it are gated.",
  },
  {
    path: "app/layout.tsx",
    reason:
      "The root layout — html/body, fonts, consent and analytics wiring. Nothing renders without it; the site profile swaps in core's `layout.static.tsx` variant rather than removing it.",
  },
  {
    path: "app/error.tsx",
    reason:
      "The shop's runtime error boundary. Without it a thrown render error hands the visitor Next's default screen instead of the site's own recovery page.",
  },
  {
    path: "app/global-error.tsx",
    reason:
      "The last-resort boundary for an error in the root layout itself. It has to exist in every profile for exactly the case where nothing else does.",
  },
  {
    path: "app/globals.css",
    reason:
      "The shop's stylesheet entry — Tailwind layers plus the palette tokens every design pack reads. A profile without it renders unstyled HTML.",
  },
  {
    path: "app/icon.tsx",
    reason:
      "The favicon, rendered from `brand.logo` so the mark is defined in one place. It is generated from the CUSTOMER's brand, never ours.",
  },
  {
    path: "app/opengraph-image.tsx",
    reason:
      "The default share card, also rendered from the customer's brand. Removing it would drop link previews on every page that has no image of its own.",
  },
  {
    path: "app/robots.ts",
    reason:
      "The shop's robots.txt, built from its own SEO settings and its own sitemap URL. Crawl policy is the site owner's, in every profile.",
  },
  {
    path: "app/index.md",
    reason:
      "The `/index.md` suffix alias for the markdown homepage — the same document `/` serves under content negotiation, for agents that probe suffixes before headers.",
  },
  {
    path: "app/lib",
    reason:
      "The View Transitions wrapper the storefront navigation uses. It is app-local UI plumbing rather than a module's surface, and every profile's storefront can use it.",
  },
  {
    path: "app/[locale]/[...missing]",
    reason:
      "The locale-prefixed catch-all that turns an unknown path into the shop's own 404 instead of a framework error page.",
  },
  {
    path: "app/[locale]/not-found.tsx",
    reason:
      "The shop's 404 body. Removing it in any profile would hand a visitor Next's default page instead of the site's chrome.",
  },
  {
    path: "README.md",
    reason:
      "The customer's project README — the scaffolder rewrites its identity lines; the document itself is theirs to keep and edit.",
  },
  {
    path: "AGENTS.md",
    reason:
      "The agent briefing every IDE agent reads on open. A scaffold without it is a scaffold whose AI does not know what it is working on.",
  },
  {
    path: "ARCHITECTURE.md",
    reason:
      "How the engine the customer now owns is put together — the document a developer opens before the first change to their fork.",
  },
  {
    path: "DEPLOY.md",
    reason:
      "The customer's deploy runbook (Vercel, env, database). It is about THEIR site, not about ours, and is the answer to their first question.",
  },
  {
    path: "DESIGN.md",
    reason:
      "The design playbook a customer's agent is told to read before touching the look. Shipping the design layer without it is shipping half of it.",
  },
  {
    path: "FORK_GUIDE.md",
    reason:
      "The guide for turning this engine into your own shop — written for exactly the reader who now has a scaffold in front of them.",
  },
  {
    path: "GEMINI.md",
    reason:
      "The Gemini CLI's rules file, sibling of AGENTS.md and .github/copilot-instructions.md — the same briefing for a different agent.",
  },
  {
    path: "CONTRIBUTING.md",
    reason:
      "Named as debt, not as a virtue: README.md links it, so removing it would leave a dead link. It describes contributing to the ENGINE and should be rewritten for the customer's project (B-series follow-up).",
  },
  {
    path: "CODE_OF_CONDUCT.md",
    reason:
      "Same debt: linked from CONTRIBUTING.md and generic enough to stand, but it is our community's document travelling in a customer's repository.",
  },
  {
    path: "SECURITY.md",
    reason:
      "Same debt: it points a reporter at our disclosure address. It ships because README.md links it; making it the customer's is follow-up work.",
  },
  {
    path: "SUPPORT.md",
    reason:
      "Same debt again — our support channels, shipped because the README links them. A customer should replace the contents, not find the file missing.",
  },
  {
    path: ".github/copilot-instructions.md",
    reason:
      "Copilot's copy of the agent briefing. It ships for the same reason AGENTS.md does: the customer's agent must self-identify as their Cartwright store.",
  },
];
