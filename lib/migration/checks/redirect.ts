import { z } from "zod";
import { ENGINE_LEGACY_SEGMENTS, stripLocaleAndQuery, type RedirectMap } from "@/lib/redirects/match";
import { LOCALE_SEGMENT_RE, permalinkKey } from "@/lib/urls";
import type { MigrationFetcher, MigrationResponse } from "../fetch";
import { URL_PARITY_MAX_HOPS } from "./url";

/**
 * MIGD `redirect.*` — does a saved redirect do what it was saved to do? Pure over
 * an injected fetcher (a `migrationFetcher` bound to the new host) and what the
 * runner read. Nothing here writes a redirect.
 *
 * redirect.imported, each saved row, `redirect: "manual"`, one hop at a time:
 *
 *   its saved status, its saved target, then 200           landed        pass
 *   any other status, or no redirect at all                wrong-status  fail
 *   its saved status to another target                     wrong-target  fail
 *   the target redirects again                             chain         fail
 *   a URL already visited                                  loop          fail
 *   the target answers anything else but 200               bad-landing   fail
 *   a refused or empty answer, no Location, unreadable row error         fail
 *   as saved, to a target on another site (never fetched)  external      inconclusive
 *   000/5xx/429 before a second redirect                   inconclusive  inconclusive
 *
 * A target is compared as the proxy writes it (lib/redirects/match.ts): a slash and
 * a locale prefix are `brand.urls`' to add or drop, and a hop they cost still counts.
 * It never swaps one locale for another, so a different locale on each side is another target.
 * One on the domain that moves (the redirect CSV's feed rows) is this site after the
 * switch, so it is measured here. Only the host moves, so one on another scheme or port
 * is `external`: a visitor would not get what this site answers (plain http, one more hop).
 *
 * redirect.active: with `UPSTASH_*` set the proxy reads ONLY the Redis map, so a row
 * the map lacks is never served. Without, it reads the `Redirect` table (RED1), and
 * the table against itself proves nothing, so the site's own first answer for a
 * bounded sample counts too. A row failing either is "saved but not active": warn.
 * A store that cannot be read hides only itself: a row the site did not answer as saved
 * is still that warn, and anything else, nothing saved included, is inconclusive.
 *
 * redirect.legacy-shadow, no fetch: both proxies answer `LEGACY_SLUG_MAP`'s first
 * segments before the merchant redirects, so a frozen path under one never reaches
 * its page. Only a stored permalink answers first (`brand.urls.permalinks` on); the
 * matcher never sees a dotted path at all.
 */

export const REDIRECT_CHECKS = ["redirect.imported", "redirect.active", "redirect.legacy-shadow"] as const;
export type RedirectCheckId = (typeof REDIRECT_CHECKS)[number];
/** Rows `redirect.active` asks the site about, spread over the table. */
export const REDIRECT_ACTIVE_SAMPLE = 10;

export type SavedRedirect = { fromPath: string; toPath: string; statusCode: number };
export type RedirectClass = "landed" | "wrong-status" | "wrong-target" | "chain" | "loop" | "bad-landing" | "error" | "external" | "inconclusive";
export type RedirectRowStatus = "pass" | "fail" | "inconclusive";
/** `http` is the last hop's status (0 = no response), `hops` every request made on the new host. */
export type RedirectResult = {
  fromPath: string; toPath: string; saved: number; finalUrl: string; class: RedirectClass; status: RedirectRowStatus;
  http: number; hops: { url: string; status: number }[]; detail?: string;
};
type RedirectCtx = { targetOrigin: string; fetch: MigrationFetcher };

const bareHost = (h: string) => h.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
const targetKey = (u: URL) => `${u.origin}${stripLocaleAndQuery(u.pathname)}${u.search}`;
const localeOf = (u: URL) => LOCALE_SEGMENT_RE.exec(u.pathname)?.[1];
const sameTarget = (a: URL, b: URL) => targetKey(a) === targetKey(b) && (!localeOf(a) || !localeOf(b) || localeOf(a) === localeOf(b));
const statusOf = (cls: RedirectClass): RedirectRowStatus =>
  cls === "landed" ? "pass" : cls === "external" || cls === "inconclusive" ? "inconclusive" : "fail";

/** The new site's origin and the row's first URL on it, or null: never resolved, so `//host/a` stays a path on the new site. */
function openRow(row: SavedRedirect, targetOrigin: string): { origin: URL; first: URL } | null {
  if (!URL.canParse(targetOrigin) || !row.fromPath.startsWith("/")) return null;
  const origin = new URL(targetOrigin);
  const raw = `${origin.origin}${row.fromPath}`;
  return URL.canParse(raw) ? { origin, first: new URL(raw) } : null;
}

/** The first answer against the saved row: what is wrong with it, or where it goes. */
function firstAnswer(row: SavedRedirect, res: MigrationResponse, from: URL, origin: URL): { class: RedirectClass; detail?: string } | { next: URL } {
  if (res.outcome === "inconclusive") return { class: "inconclusive", detail: res.reason };
  if (res.outcome !== "answer") return { class: "error", detail: res.reason };
  const { status, location } = res;
  if (status !== row.statusCode || status < 300 || status >= 400) {
    return { class: "wrong-status", detail: `answers HTTP ${status}${location ? ` to ${location}` : ""}; saved: ${row.statusCode} to ${row.toPath}` };
  }
  const next = location && URL.canParse(location, from) ? new URL(location, from) : null;
  if (!next) return { class: "error", detail: `HTTP ${status} without a readable Location` };
  const saved = URL.canParse(row.toPath, origin) ? new URL(row.toPath, origin) : null;
  if (!saved || !sameTarget(next, saved)) return { class: "wrong-target", detail: `redirects to ${next.href}; saved: ${row.toPath}` };
  return { next };
}

/** The address `url` is measured at: on the new site, which the domain that moves will be, else nowhere. */
function onNewSite(url: URL, origin: URL, movingHost: string | undefined): URL | null {
  if (url.origin === origin.origin) return url;
  const moves = movingHost && bareHost(url.hostname) === bareHost(movingHost) && url.protocol === origin.protocol && !url.port;
  return moves ? new URL(`${origin.origin}${url.pathname}${url.search}`) : null;
}

export async function classifyRedirect(row: SavedRedirect, ctx: RedirectCtx & { movingHost?: string; maxHops?: number }): Promise<RedirectResult> {
  const opened = openRow(row, ctx.targetOrigin);
  const hops: RedirectResult["hops"] = [];
  let finalUrl = opened?.first.href ?? "";
  const done = (cls: RedirectClass, detail?: string): RedirectResult => ({
    fromPath: row.fromPath, toPath: row.toPath, saved: row.statusCode, finalUrl,
    class: cls, status: statusOf(cls), http: hops.at(-1)?.status ?? 0, hops, ...(detail ? { detail } : {}),
  });
  if (!opened) return done("error", "the saved source is not a path on the new site");
  const { origin, first } = opened;
  const res = await ctx.fetch(first.href);
  hops.push({ url: first.href, status: res.status });
  const verdict = firstAnswer(row, res, first, origin);
  if ("class" in verdict) return done(verdict.class, verdict.detail);
  finalUrl = verdict.next.href;
  const target = onNewSite(verdict.next, origin, ctx.movingHost);
  if (!target) {
    const why = verdict.next.protocol === origin.protocol ? "is another site" : "is not on the new site's scheme (a host that forces one adds a redirect)";
    return done("external", `answers as saved, but ${verdict.next.origin} ${why}, so whether it answers 200 is not measured`);
  }

  const seen = new Set([first.href]);
  for (let next = target; ;) {
    finalUrl = next.href;
    if (seen.has(next.href)) return done("loop", `comes back to ${next.href}`);
    seen.add(next.href);
    const answer = await ctx.fetch(next.href);
    hops.push({ url: next.href, status: answer.status });
    // Two redirects are a chain however the rest goes: a later hop that does not answer cannot soften it.
    const redirects = hops.length - 1;
    if (answer.outcome !== "answer") return done(redirects >= 2 ? "chain" : answer.outcome === "inconclusive" ? "inconclusive" : "error", answer.reason);
    const { status, location } = answer;
    if (status < 300 || status >= 400) {
      if (redirects >= 2) return done("chain", `${redirects} redirects, then HTTP ${status}`);
      return status === 200 ? done("landed") : done("bad-landing", `the target answers HTTP ${status}`);
    }
    // Followed only to tell a loop from a chain: on the new site, and never past the cap.
    const after = location && URL.canParse(location, next) ? onNewSite(new URL(location, next), origin, ctx.movingHost) : null;
    if (!after || hops.length > (ctx.maxHops ?? URL_PARITY_MAX_HOPS)) return done("chain", `the target redirects again (HTTP ${status}${location ? ` to ${location}` : ""})`);
    next = after;
  }
}

/** `firstErrors`: at most 20 non-pass rows, fails first. */
export type RedirectSummary = { counts: Record<RedirectRowStatus, number>; classes: Partial<Record<RedirectClass, number>>; processed: number; firstErrors: RedirectResult[] };

/** `rows` added to the run so far (`prev`). */
export function mergeRedirectSummary(prev: RedirectSummary | null, rows: readonly RedirectResult[]): RedirectSummary {
  const counts: Record<RedirectRowStatus, number> = { pass: 0, fail: 0, inconclusive: 0, ...prev?.counts };
  const classes = { ...prev?.classes };
  for (const r of rows) {
    counts[r.status]++;
    classes[r.class] = (classes[r.class] ?? 0) + 1;
  }
  const all = [...(prev?.firstErrors ?? []), ...rows];
  const firstErrors = (["fail", "inconclusive"] as const).flatMap((s) => all.filter((r) => r.status === s)).slice(0, 20);
  return { counts, classes, processed: (prev?.processed ?? 0) + rows.length, firstErrors };
}

export type RedirectProbe = { row: SavedRedirect; answer: "served" | "not-served" | "inconclusive"; detail?: string };

/** The site's first answer for a saved row, nothing more: where it lands is redirect.imported's. */
export async function probeRedirect(row: SavedRedirect, ctx: RedirectCtx): Promise<RedirectProbe> {
  const opened = openRow(row, ctx.targetOrigin);
  if (!opened) return { row, answer: "not-served", detail: "the saved source is not a path on the new site" };
  const verdict = firstAnswer(row, await ctx.fetch(opened.first.href), opened.first, opened.origin);
  if ("next" in verdict) return { row, answer: "served" };
  return { row, answer: verdict.class === "inconclusive" ? "inconclusive" : "not-served", detail: verdict.detail };
}

const count = z.number().int().nonnegative();
const notActiveRow = z.object({ fromPath: z.string(), toPath: z.string(), why: z.enum(["not-in-store", "differs-in-store", "not-answering"]), detail: z.string().optional() }).strict();
/** `store`: what this deploy's proxy reads, Redis with `UPSTASH_*` set, else the table. `servedNotSaved`: sources it has that no saved row has (at most 20). */
export const redirectActiveSummarySchema = z.object({
  status: z.enum(["pass", "warn", "skip", "inconclusive"]),
  state: z.enum(["active", "saved-not-active", "served-not-saved", "nothing-saved", "not-measured"]),
  store: z.enum(["redis", "database"]), saved: count, inStore: count, probed: count, answering: count,
  notActive: z.object({ count, first: z.array(notActiveRow) }).strict(),
  servedNotSaved: z.array(z.string()), detail: z.string(),
}).strict();
export type RedirectActiveSummary = z.infer<typeof redirectActiveSummarySchema>;

const CAP = 20;
const STORE_NAME = { redis: "Redis map", database: "Redirect table" } as const;
const WHY_NOT_ACTIVE = {
  redis: "This site's proxy reads the Redis map (UPSTASH_*), so a row that map lacks is never served; saving any redirect in /admin/redirects writes the whole map again.",
  database: "Without Upstash this site's proxy reads the Redirect table, unless the deployed build is older than that read (v0.62.0) or the proxy cannot reach the database.",
} as const;

/** `served`: the store's map, null when unreadable. `sample`: rows due to be asked; a budget can stop short, and a row not asked proves nothing. */
export function judgeRedirectActive(input: { saved: readonly SavedRedirect[]; store: "redis" | "database"; served: RedirectMap | null; probes: readonly RedirectProbe[]; sample: number }): RedirectActiveSummary {
  const { saved, store, served, probes, sample } = input;
  const notActive = new Map<string, z.infer<typeof notActiveRow>>();
  for (const { fromPath, toPath, statusCode } of served ? saved : []) {
    const rule = served?.[fromPath];
    if (rule?.to !== toPath || rule.status !== statusCode) notActive.set(fromPath, { fromPath, toPath, why: rule ? "differs-in-store" : "not-in-store", ...(rule ? { detail: `the store has ${rule.status} to ${rule.to}` } : {}) });
  }
  const inStore = served ? saved.length - notActive.size : 0;
  for (const { row, answer, detail } of probes) {
    if (answer === "not-served" && !notActive.has(row.fromPath)) notActive.set(row.fromPath, { fromPath: row.fromPath, toPath: row.toPath, why: "not-answering", ...(detail ? { detail } : {}) });
  }
  const savedPaths = new Set(saved.map((r) => r.fromPath));
  const extra = Object.keys(served ?? {}).filter((from) => !savedPaths.has(from));
  const summary = (status: RedirectActiveSummary["status"], state: RedirectActiveSummary["state"], detail: string): RedirectActiveSummary => ({
    status, state, store, saved: saved.length, inStore, probed: probes.length, answering: probes.filter((p) => p.answer === "served").length,
    notActive: { count: notActive.size, first: [...notActive.values()].slice(0, CAP) }, servedNotSaved: extra.slice(0, CAP), detail,
  });
  // What the site answered holds without the store, and "nothing saved" says nothing about a map that cannot be read.
  const known = served
    ? `${notActive.size} of ${saved.length} saved redirects are saved but not active. ${WHY_NOT_ACTIVE[store]}`
    : `${notActive.size} of the ${probes.length} saved redirects asked are saved but not active. The ${STORE_NAME[store]} could not be read, so the rest are not known, and a proxy that cannot read it serves no redirect.`;
  if (notActive.size > 0) return summary("warn", "saved-not-active", `${known} Its copy is up to 60 s old, so run this again if you just saved, and it never answers a path with a dot in it, under /api or /admin, or under a legacy slug.`);
  if (!served) return summary("inconclusive", "not-measured", `The ${STORE_NAME[store]} could not be read, so what the proxy serves is not known.`);
  if (saved.length === 0 && extra.length === 0) return summary("skip", "nothing-saved", "No redirect is saved on this site, so nothing was measured.");
  if (extra.length > 0) return summary("warn", "served-not-saved", `The ${STORE_NAME[store]} serves ${extra.length} source(s) no saved redirect has; saving any redirect in /admin/redirects writes the whole map again.`);
  if (probes.length < sample || probes.some((p) => p.answer === "inconclusive")) return summary("inconclusive", "not-measured", "The new site did not answer for every sampled redirect, so what it serves is not known. Run it again.");
  return summary("pass", "active", `All ${saved.length} saved redirects are in the ${STORE_NAME[store]} the proxy reads, and the ${probes.length} asked on the new site answered as saved.`);
}

/** `permalinkBranch`: `brand.urls.permalinks`. `servedByPermalink`: frozen paths under a legacy slug that a stored permalink answers first. */
export const legacyShadowSummarySchema = z.object({
  status: z.enum(["pass", "fail", "skip"]), permalinkBranch: z.boolean(), checked: count, servedByPermalink: count,
  shadowed: z.object({ count, first: z.array(z.object({ path: z.string(), segment: z.string() }).strict()) }).strict(),
  detail: z.string(),
}).strict();
export type LegacyShadowSummary = z.infer<typeof legacyShadowSummarySchema>;

/** `permalinks`: the map the proxy serves with the permalink branch on, null with it off. */
export function judgeLegacyShadow(input: { paths: readonly string[]; permalinks: Readonly<Record<string, unknown>> | null }): LegacyShadowSummary {
  const { paths, permalinks } = input;
  const shadowed: { path: string; segment: string }[] = [];
  let servedByPermalink = 0;
  for (const path of paths) {
    const pathname = path.split(/[?#]/)[0].replace(LOCALE_SEGMENT_RE, "");
    const segment = pathname.split("/")[1] ?? "";
    if (pathname.includes(".") || !(ENGINE_LEGACY_SEGMENTS as readonly string[]).includes(segment)) continue;
    const key = permalinks ? permalinkKey(pathname) : null;
    if (key && permalinks && key in permalinks) servedByPermalink++;
    else shadowed.push({ path, segment });
  }
  const base = { permalinkBranch: permalinks !== null, checked: paths.length, servedByPermalink, shadowed: { count: shadowed.length, first: shadowed.slice(0, CAP) } };
  if (paths.length === 0) return { ...base, status: "skip", detail: "No URL is frozen yet, so no path was compared. Freeze the old site's sitemap first." };
  if (shadowed.length === 0) return { ...base, status: "pass", detail: `None of the ${paths.length} frozen paths is answered by the engine's legacy slugs.` };
  const why = permalinks ? "no product or category stores it as its permalink" : "the permalink branch (brand.urls.permalinks) is off";
  return { ...base, status: "fail", detail: `${shadowed.length} frozen paths sit under a legacy slug the engine redirects first, and ${why}.` };
}
