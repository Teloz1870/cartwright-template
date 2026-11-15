import { CHECK_CATALOG, type CatalogRow } from "./catalog";

/**
 * "Ready for DNS switch: n/m" — pure, so the board and (later) the
 * `migration.status` tool give the same number.
 *
 *   m = every `required` catalogue row.
 *   n = the required rows whose LATEST run is a pass that finished less than
 *       24 hours ago and is bound to the current snapshot/build/config.
 *
 * `skip`, `inconclusive`, `warn`, a run that never finished and a row that
 * never ran all stay in the denominator: the counter can only under-claim.
 * On a check+sign-off row the latest run is what `withSignOff` makes of it: the
 * board's read (store.ts) applies it, so a check alone never makes that row a pass.
 */

/** `mailSender` is dns.mail's alone: the sender it read (`mailSenderKey`). The board reads a run of another sender as no run (store.ts), so it is no key of `isFreshPass`. */
export type RunBindings = { snapshotId?: string; buildSha?: string; configHash?: string; redirectsHash?: string; mailSender?: string };

export type LatestRun = {
  checkId: string;
  status: string;
  finishedAt: Date | null;
  bindings: RunBindings | null;
  /** Why the row reads as it does, when the run or the sign-off says. */
  detail?: string;
};

export const READY_WINDOW_MS = 24 * 60 * 60 * 1000;

const BINDING_KEYS = ["snapshotId", "buildSha", "configHash", "redirectsHash"] as const;

/** The checks that measure the saved redirects: saving, changing or removing one makes their pass stale. */
export const REDIRECT_BOUND_CHECKS: readonly string[] = ["redirect.imported", "redirect.active"];

/**
 * What a run of `row` must still be bound to. A sign-off (`verify: "attest"`)
 * was not measured on a build, so a deploy never voids it — a new snapshot or
 * new site still does. Every other row is judged on all of `current`, bar the redirects' hash.
 */
export function bindingsFor(row: Pick<CatalogRow, "id" | "verify"> | undefined, current: RunBindings): RunBindings {
  if (row?.verify === "attest") return { snapshotId: current.snapshotId, configHash: current.configHash };
  return row && REDIRECT_BOUND_CHECKS.includes(row.id) ? current : { ...current, redirectsHash: undefined };
}

/** A pass that still counts. A binding the caller knows and the run disagrees with (a new freeze, deploy or config) makes it stale. */
export function isFreshPass(run: LatestRun | undefined, now: Date, current: RunBindings = {}): boolean {
  if (!run || run.status !== "pass" || !run.finishedAt) return false;
  const age = now.getTime() - run.finishedAt.getTime();
  if (age < 0 || age >= READY_WINDOW_MS) return false;
  return BINDING_KEYS.every((k) => current[k] === undefined || run.bindings?.[k] === current[k]);
}

export type SignOffState = "missing" | "stale" | "pass" | "warn" | "fail";

/**
 * A check+sign-off row's sign-off, as `attestations` keeps it, read like a pure sign-off's run. A pass ages and is bound:
 * under 24 hours, on the current snapshot and new site, or it is `stale`. A warn or a fail stays what it said until the owner signs again.
 */
export function signOffState(entry: unknown, now: Date, current: RunBindings): SignOffState {
  const { status, at, bindings } = (entry ?? {}) as { status?: unknown; at?: unknown; bindings?: RunBindings };
  if ((status !== "pass" && status !== "warn" && status !== "fail") || typeof at !== "string" || Number.isNaN(Date.parse(at))) return "missing";
  if (status !== "pass") return status;
  const signed = { checkId: "", status, finishedAt: new Date(at), bindings: bindings ?? null };
  return isFreshPass(signed, now, bindingsFor({ id: "", verify: "attest" }, current)) ? status : "stale";
}

const WORST = ["fail", "inconclusive", "warn", "skip"] as const;
const SIGN_OFF_WHY: Record<SignOffState, string | null> = {
  missing: "Waiting for the owner's sign-off (migration.attest).",
  stale: "The owner's sign-off is over 24 hours old, or from before the last freeze or another new site: sign off again.",
  pass: null,
  warn: "The owner signed this off as a warn.",
  fail: "The owner signed this off as a fail.",
};

/** A check+sign-off row reads as the worse of its run and its sign-off; only two passes make a pass. A sign-off that is missing or stale reads `inconclusive`. */
export function withSignOff(run: LatestRun, state: SignOffState): LatestRun {
  const signed = state === "missing" || state === "stale" ? "inconclusive" : state;
  const status = run.status === "pass" && signed === "pass" ? "pass" : (WORST.find((s) => s === run.status || s === signed) ?? "inconclusive");
  const detail = [run.detail, SIGN_OFF_WHY[state]].filter(Boolean).join(" ");
  return { ...run, status, ...(detail ? { detail } : {}) };
}

export function readyForDns(
  latest: ReadonlyMap<string, LatestRun>,
  opts: { now: Date; current?: RunBindings; catalog?: readonly CatalogRow[] },
): { ready: number; required: number; missing: string[] } {
  const required = (opts.catalog ?? CHECK_CATALOG).filter((r) => r.required);
  const missing = required.filter((r) => !isFreshPass(latest.get(r.id), opts.now, bindingsFor(r, opts.current ?? {}))).map((r) => r.id);
  return { ready: required.length - missing.length, required: required.length, missing };
}
