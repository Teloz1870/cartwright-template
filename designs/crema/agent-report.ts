/**
 * Crema — live agent-readiness report (is-agentic.com).
 *
 * The homepage's agent-ready strip shows the shop's CURRENT independently
 * measured score — never a baked-in number: the is-agentic rubric changes
 * (check counts have shifted mid-day before), so a hardcoded score is a lie
 * waiting to happen. The report is fetched server-side with a short timeout
 * and ISR-style revalidation; on any failure the caller renders the strip
 * link-only (the pack's never-guess rule applied to our own marketing).
 *
 * Score and link can never disagree: both come from the same API response
 * (`report_url` is part of the payload).
 */

export type AgentReport = {
  /** 0–100 integer as published by is-agentic. */
  score: number;
  /** The public scorecard this score belongs to. */
  reportUrl: string;
};

/** Narrow an is-agentic `/api/report` payload. Pure — unit-tested. */
export function parseAgentReport(json: unknown): AgentReport | null {
  if (json === null || typeof json !== "object" || Array.isArray(json)) return null;
  const r = json as Record<string, unknown>;
  const score = r.score;
  const reportUrl = r.report_url;
  if (
    typeof score !== "number" ||
    !Number.isInteger(score) ||
    score < 0 ||
    score > 100
  ) {
    return null;
  }
  if (typeof reportUrl !== "string" || !reportUrl.startsWith("https://is-agentic.com/")) {
    return null;
  }
  return { score, reportUrl };
}

/**
 * Fetch the report for a target like "demo.cartwright.app/da". Fail-soft:
 * timeout, non-200, or an unexpected shape all return null. Revalidated
 * every 6 h so the strip tracks rescans without a redeploy.
 */
export async function fetchAgentReport(target: string): Promise<AgentReport | null> {
  try {
    const res = await fetch(
      `https://is-agentic.com/api/report?url=${encodeURIComponent(target)}`,
      {
        signal: AbortSignal.timeout(2500),
        next: { revalidate: 21600 },
      },
    );
    if (!res.ok) return null;
    return parseAgentReport(await res.json());
  } catch {
    return null;
  }
}
