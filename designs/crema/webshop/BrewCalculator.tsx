"use client";

/**
 * Crema — brew calculator (the echo of KompositZaun's material calculator,
 * honestly scaled down to what a coffee bar needs): cups + strength ratio →
 * grams of coffee and water. Pure client math — no DB, no network.
 *
 * One cup = 2 dl (200 g water); ratios match the shop's own brewing guide
 * (1:15 strong · 1:16 balanced · 1:17 bright), so 2 cups at 1:16 = 25 g
 * coffee / 400 g water. All copy arrives as props from the server homepage
 * (Crema.calc.* messages) so the island stays locale-agnostic.
 */
import { useId, useState } from "react";
import { computeBrew, RATIOS, type Ratio } from "./brew-math";

export type BrewCalculatorLabels = {
  cups: string;
  cupsHint: string;
  strength: string;
  ratio: Record<Ratio, string>;
  coffee: string;
  water: string;
};

export function BrewCalculator({ labels }: { labels: BrewCalculatorLabels }) {
  const [cups, setCups] = useState(2);
  const [ratio, setRatio] = useState<Ratio>(16);
  const cupsId = useId();
  const groupName = useId();

  const { coffeeGrams: coffee, waterGrams: water } = computeBrew(cups, ratio);

  return (
    <div className="crema-calc">
      <div className="crema-calc-controls">
        <div>
          <label htmlFor={cupsId} className="crema-calc-label">
            {labels.cups} <span className="opacity-60">({labels.cupsHint})</span>
          </label>
          <input
            id={cupsId}
            type="number"
            inputMode="numeric"
            min={1}
            max={12}
            value={cups}
            onChange={(e) => {
              const n = Math.floor(Number(e.target.value));
              if (Number.isFinite(n)) setCups(Math.min(12, Math.max(1, n)));
            }}
            className="crema-calc-input"
          />
        </div>

        <fieldset className="crema-calc-fieldset">
          <legend className="crema-calc-label">{labels.strength}</legend>
          <div className="crema-calc-seg" role="presentation">
            {RATIOS.map((r) => (
              <label key={r} className="crema-calc-opt" data-on={ratio === r ? "" : undefined}>
                <input
                  type="radio"
                  name={groupName}
                  value={r}
                  checked={ratio === r}
                  onChange={() => setRatio(r)}
                  className="sr-only"
                />
                {labels.ratio[r]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <p className="crema-calc-result" aria-live="polite">
        <span className="crema-display crema-calc-num">{coffee} g</span>
        <span className="crema-calc-unit">{labels.coffee}</span>
        <span aria-hidden className="crema-calc-sep">
          ·
        </span>
        <span className="crema-display crema-calc-num">{water} g</span>
        <span className="crema-calc-unit">{labels.water}</span>
      </p>
    </div>
  );
}
