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
 */

export type RunBindings = { snapshotId?: string; buildSha?: string; configHash?: string };

export type LatestRun = {
  checkId: string;
  status: string;
  finishedAt: Date | null;
  bindings: RunBindings | null;
};

export const READY_WINDOW_MS = 24 * 60 * 60 * 1000;

const BINDING_KEYS = ["snapshotId", "buildSha", "configHash"] as const;

/**
 * What a run of `row` must still be bound to. A sign-off (`verify: "attest"`)
 * was not measured on a build, so a deploy never voids it — a new snapshot or
 * new site still does. Every other row is judged on all of `current`.
 */
export function bindingsFor(row: Pick<CatalogRow, "verify"> | undefined, current: RunBindings): RunBindings {
  return row?.verify === "attest" ? { snapshotId: current.snapshotId, configHash: current.configHash } : current;
}

/** A pass that still counts. A binding the caller knows and the run disagrees with (a new freeze, deploy or config) makes it stale. */
export function isFreshPass(run: LatestRun | undefined, now: Date, current: RunBindings = {}): boolean {
  if (!run || run.status !== "pass" || !run.finishedAt) return false;
  const age = now.getTime() - run.finishedAt.getTime();
  if (age < 0 || age >= READY_WINDOW_MS) return false;
  return BINDING_KEYS.every((k) => current[k] === undefined || run.bindings?.[k] === current[k]);
}

export function readyForDns(
  latest: ReadonlyMap<string, LatestRun>,
  opts: { now: Date; current?: RunBindings; catalog?: readonly CatalogRow[] },
): { ready: number; required: number; missing: string[] } {
  const required = (opts.catalog ?? CHECK_CATALOG).filter((r) => r.required);
  const missing = required.filter((r) => !isFreshPass(latest.get(r.id), opts.now, bindingsFor(r, opts.current ?? {}))).map((r) => r.id);
  return { ready: required.length - missing.length, required: required.length, missing };
}
