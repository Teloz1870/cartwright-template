import type { NextAction, NextActionSeverity } from "@/lib/orders/next-action";

/**
 * AI næste-skridt — viser de REGELBASEREDE forslag (altid-på, deterministiske,
 * ingen LLM-omkostning). Hvert forslag deep-linker til den relevante sektion
 * på detalje-siden. En valgfri LLM-overbygning ("Spørg AI om denne ordre") kan
 * tilføjes senere oven på samme rule-engine.
 */

const SEVERITY_STYLES: Record<NextActionSeverity, string> = {
  urgent: "border-rose-300 bg-rose-50 text-rose-900",
  warn: "border-orange-300 bg-orange-50 text-orange-900",
  info: "border-sol-ink/15 bg-white/60 text-sol-ink",
};

// Forslag → anker på detalje-siden (sektioner har matchende id'er).
const ANCHORS: Record<string, string> = {
  "ship-now": "#status",
  "create-fulfillment": "#fulfillment",
  "follow-up-delivery": "#tracking",
  "review-mismatch": "#status",
  "submit-dispute-evidence": "#handlinger",
  "process-return": "#returneringer",
  "awaiting-payment": "#status",
  "low-stock": "#varer",
};

export default function OrderAiPanel({
  suggestions,
}: {
  suggestions: NextAction[];
}) {
  return (
    <section className="rounded-2xl border border-sol-accent/20 bg-sol-accent/5 p-5 shadow-sm">
      <h2 className="mb-1 text-xl font-black text-sol-ink">Næste skridt</h2>
      <p className="mb-4 text-xs text-sol-muted">
        AI-foreslåede handlinger baseret på ordrens tilstand.
      </p>
      {suggestions.length === 0 ? (
        <p className="text-sm font-semibold text-sol-muted">
          Intet kræver handling lige nu. ✓
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {suggestions.map((s) => (
            <li key={s.key}>
              <a
                href={ANCHORS[s.key] ?? "#status"}
                className={`block rounded-xl border px-4 py-3 transition hover:brightness-[0.98] ${SEVERITY_STYLES[s.severity]}`}
              >
                <span className="block text-sm font-black">{s.label}</span>
                <span className="block text-xs opacity-80">{s.reason}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
