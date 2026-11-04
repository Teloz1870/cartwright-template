/**
 * Crema — agent-ready proof strip (Server Component).
 *
 * Renders on the homepage ONLY when the profile + runtime expose the public
 * agent API (`agentApiEnabled` — capability-aware discovery, same gate the
 * engine uses everywhere). Shows the shop's live is-agentic score when the
 * report fetch succeeds; otherwise the strip degrades to the scorecard link
 * without a number — never a stale or invented score.
 */
import { useTranslations } from "next-intl";
import { getBrand } from "@/lib/brand";
import { fetchAgentReport } from "./agent-report";

function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export async function CremaAgentStrip({ locale }: { locale: string }) {
  // The runtime address, as canonicals and the sitemap use: an operator's domain
  // from the setup wizard wins, so the score shown is this shop's own.
  const host = hostname((await getBrand()).url);
  if (!host) return null;
  const target = `${host}/${locale}`;
  const report = await fetchAgentReport(target);

  return <CremaAgentStripBody target={target} report={report} />;
}

function CremaAgentStripBody({
  target,
  report,
}: {
  target: string;
  report: { score: number; reportUrl: string } | null;
}) {
  const t = useTranslations("Crema");

  return (
    <section className="crema-section">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="crema-agent crema-rise">
          <div className="min-w-0">
            <p className="crema-eyebrow">{t("agentEyebrow")}</p>
            <h2 className="crema-display mt-3 text-2xl leading-tight sm:text-3xl">
              {t("agentTitle")}
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-[var(--crema-muted)]">
              {t("agentBody")}
            </p>
            <p className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-[family-name:var(--font-crema-mono)] text-xs uppercase tracking-[0.18em]">
              <a
                className="text-[var(--crema-copper-hi)] hover:underline"
                href={
                  report?.reportUrl ?? `https://is-agentic.com/scan/${target}`
                }
                rel="noopener"
              >
                {t("agentReportLink")} ↗
              </a>
              <a className="text-[var(--crema-copper-hi)] hover:underline" href="/llms.txt">
                llms.txt ↗
              </a>
            </p>
          </div>
          {report ? (
            <div className="crema-agent-score" aria-label={t("agentScoreAria", { score: report.score })}>
              <span className="crema-display crema-agent-num">{report.score}</span>
              <span className="crema-agent-max">/ 100</span>
              <span className="crema-agent-src">{t("agentMeasuredBy")}</span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
