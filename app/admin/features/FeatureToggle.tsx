"use client";

import { useState, useTransition } from "react";

import { setFeatureOverrideAction } from "./actions";

/**
 * Per-row live toggle for a runtime feature. Optimistic: flips locally right
 * away, calls the server action, and rolls back + shows an error if
 * server-validering afviser (allowlist/dependency/precondition).
 */
export function FeatureToggle({
  featureKey,
  label,
  initialEnabled,
  blockedReason,
}: {
  featureKey: string;
  label: string;
  initialEnabled: boolean;
  /** If set AND the feature is OFF: cannot be enabled yet (show reason, disable). */
  blockedReason: string | null;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Blocked (dependency/precondition) applies only when ENABLING a disabled one.
  const disabled = pending || (!enabled && Boolean(blockedReason));

  function onToggle(next: boolean) {
    setError(null);
    setEnabled(next); // optimistisk
    startTransition(async () => {
      const res = await setFeatureOverrideAction(featureKey, next);
      if (!res.ok) {
        setEnabled(!next); // rul tilbage
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <label className="inline-flex cursor-pointer items-center gap-2">
        <span className="sr-only">{label}</span>
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-5 w-9 cursor-pointer appearance-none rounded-full bg-sol-ink/20 transition-colors checked:bg-sol-accent disabled:cursor-not-allowed disabled:opacity-40 relative before:absolute before:left-0.5 before:top-0.5 before:h-4 before:w-4 before:rounded-full before:bg-white before:transition-transform checked:before:translate-x-4"
        />
      </label>
      {!enabled && blockedReason && (
        <span className="max-w-[14rem] text-right text-[10px] leading-tight text-amber-700">
          {blockedReason}
        </span>
      )}
      {error && (
        <span className="max-w-[14rem] text-right text-[10px] leading-tight text-red-600">
          {error}
        </span>
      )}
    </div>
  );
}
