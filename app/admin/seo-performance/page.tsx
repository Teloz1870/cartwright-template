import { getSeoOverview } from "./actions";
import { RunGeoButton } from "./RunGeoButton";

export const dynamic = "force-dynamic";

export default async function SeoPerformancePage() {
  const { geo, experiments, shareOfVoice } = await getSeoOverview();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-black text-sol-ink">SEO/GEO Autopilot</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
          Måler AI-synlighed (GEO) + søge-performance (GSC — kræver OAuth), og kører
          selvforbedrende genome-eksperimenter (apply → mål → behold/revert).
          Pro-feature.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-black text-sol-ink">
            AI share-of-voice {shareOfVoice != null && <span className="text-sol-accent">{shareOfVoice}%</span>}
          </h2>
          <RunGeoButton />
        </div>
        {geo.length === 0 ? (
          <p className="text-sm text-sol-muted">Ingen GEO-målinger endnu. Klik &quot;Mål GEO nu&quot;.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {geo.slice(0, 10).map((g) => (
              <li key={g.id} className="flex items-center justify-between rounded-lg border-2 border-sol-ink/10 px-3 py-2">
                <span className="truncate text-sol-ink">{g.prompt}</span>
                <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${g.cited ? "bg-emerald-100 text-emerald-700" : "bg-sol-ink/10 text-sol-muted"}`}>
                  {g.cited ? "citeret" : "ikke citeret"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-black text-sol-ink">Eksperimenter</h2>
        {experiments.length === 0 ? (
          <p className="text-sm text-sol-muted">Ingen eksperimenter endnu.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border-2 border-sol-ink/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-sol-sand text-xs uppercase tracking-wide text-sol-muted">
                <tr>
                  <th className="px-3 py-2">Felt</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Resultat</th>
                </tr>
              </thead>
              <tbody>
                {experiments.map((e) => (
                  <tr key={e.id} className="border-t border-sol-ink/10">
                    <td className="px-3 py-2 font-mono text-xs text-sol-ink">{e.fieldKey}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                        e.status === "kept" ? "bg-emerald-100 text-emerald-700" : e.status === "reverted" ? "bg-amber-100 text-amber-700" : "bg-sol-ink/10 text-sol-muted"
                      }`}>{e.status}</span>
                    </td>
                    <td className="px-3 py-2 text-sol-muted">{e.resultNote ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
