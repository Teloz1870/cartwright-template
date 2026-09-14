/**
 * Voice plan phase 2.2: voice usage stats injected into AiStatusPill's
 * extensions slot. Rendered server-side with a snapshot from readDailyUsage();
 * AiStatusPill polls client-side but voice stats refresh on a layout reload
 * (idempotent — the voice cap is soft and not realtime-critical).
 *
 * Shown only if voiceShopEnabled === true (the parent component decides).
 */
export default function VoiceUsageSection({
  minutesUsed,
  maxMinutesPerDay,
  enabled,
}: {
  minutesUsed: number;
  maxMinutesPerDay: number;
  enabled: boolean;
}) {
  if (!enabled) {
    return (
      <div>
        <div className="text-xs font-black uppercase tracking-widest text-sol-muted">
          Voice Shop
        </div>
        <div className="mt-1 text-xs text-sol-muted">Ikke aktiveret</div>
      </div>
    );
  }

  const pct = Math.min(
    100,
    Math.round((minutesUsed / Math.max(1, maxMinutesPerDay)) * 100),
  );
  const isWarning = pct >= 80;
  const isCritical = pct >= 100;

  return (
    <div>
      <div className="text-xs font-black uppercase tracking-widest text-sol-muted">
        Voice Shop i dag
      </div>
      <div className="mt-1 flex justify-between text-xs">
        <span className="text-sol-muted">Minutter brugt</span>
        <span
          className={`font-mono font-bold ${
            isCritical
              ? "text-red-700"
              : isWarning
                ? "text-amber-700"
                : "text-sol-ink"
          }`}
        >
          {minutesUsed.toFixed(1)} / {maxMinutesPerDay} min
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-sol-ink/10">
        <div
          className={`h-full rounded-full ${
            isCritical
              ? "bg-red-500"
              : isWarning
                ? "bg-amber-500"
                : "bg-sol-accent"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
