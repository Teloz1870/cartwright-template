"use client";

/**
 * Compare — the interactive before/after slider client island. Drag the handle
 * (or use the keyboard / a screen reader via the range input) to wipe between
 * two states. Kept separate from StudioCompare.tsx so the schema + defaults live
 * in a server module (a "use client" module's exports become client references
 * server-side and lose their data — same constraint as the configurator).
 */
import { useId, useRef, useState } from "react";
import type { StudioCompareProps } from "./StudioCompare";

function Panel({
  src,
  label,
  align,
  variant,
}: {
  src?: string;
  label: string;
  align: "left" | "right";
  variant: "before" | "after";
}) {
  return (
    <div className="absolute inset-0 h-full w-full select-none">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- template Part: arbitrary admin URLs, next/image domains aren't configured
        <img src={src} alt={label} className="h-full w-full object-cover" draggable={false} />
      ) : (
        <div
          className={
            "flex h-full w-full items-center justify-center " +
            (variant === "after"
              ? "bg-gradient-to-br from-cw-terracotta to-cw-terracotta-strong"
              : "bg-gradient-to-br from-cw-stone-300 to-cw-stone-500 dark:from-cw-stone-700 dark:to-cw-stone-900")
          }
          aria-hidden="true"
        >
          <span className="font-mono text-7xl font-bold uppercase tracking-tight text-white/15">
            {variant}
          </span>
        </div>
      )}
      <span
        className={
          "absolute top-4 rounded-full bg-black/55 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-white backdrop-blur-sm " +
          (align === "left" ? "left-4" : "right-4")
        }
      >
        {label}
      </span>
    </div>
  );
}

export function CompareClient({
  eyebrow,
  title,
  description,
  beforeLabel,
  afterLabel,
  beforeSrc,
  afterSrc,
}: StudioCompareProps) {
  const id = useId();
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const setFromClientX = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const p = ((clientX - r.left) / r.width) * 100;
    setPos(Math.max(0, Math.min(100, p)));
  };

  return (
    <section className="border-b border-cw-stone-200 bg-cw-paper py-20 dark:border-cw-stone-800 dark:bg-cw-stone-900/40 sm:py-24">
      <div className="mx-auto max-w-5xl px-6">
        {(eyebrow || title || description) && (
          <div className="mx-auto mb-10 max-w-2xl text-center">
            {eyebrow && (
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-cw-terracotta">{eyebrow}</p>
            )}
            {title && (
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-cw-stone-900 sm:text-4xl dark:text-cw-stone-50">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-4 text-base leading-relaxed text-cw-stone-500 sm:text-lg dark:text-cw-stone-400">
                {description}
              </p>
            )}
          </div>
        )}

        <div
          ref={ref}
          className="relative aspect-[16/10] w-full touch-none overflow-hidden rounded-3xl border border-cw-stone-200 shadow-xl dark:border-cw-stone-800"
          onPointerDown={(e) => {
            dragging.current = true;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            setFromClientX(e.clientX);
          }}
          onPointerMove={(e) => dragging.current && setFromClientX(e.clientX)}
          onPointerUp={() => (dragging.current = false)}
        >
          {/* AFTER fills; BEFORE is clipped to the left `pos%` */}
          <Panel src={afterSrc} label={afterLabel} align="right" variant="after" />
          <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
            <Panel src={beforeSrc} label={beforeLabel} align="left" variant="before" />
          </div>

          {/* handle */}
          <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
            <div className="absolute inset-y-0 -ml-px w-0.5 bg-white/80 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" />
            <div className="absolute top-1/2 -ml-5 size-10 -translate-y-1/2 rounded-full border-2 border-white bg-cw-terracotta shadow-lg" />
            <svg
              className="absolute top-1/2 -ml-[1.05rem] size-[1.6rem] -translate-y-1/2 text-white"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path d="M9 7l-4 5 4 5M15 7l4 5-4 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* accessible control */}
          <label htmlFor={id} className="sr-only">
            Reveal {beforeLabel} vs {afterLabel}
          </label>
          <input
            id={id}
            type="range"
            min={0}
            max={100}
            value={pos}
            onChange={(e) => setPos(Number(e.target.value))}
            className="absolute inset-x-0 bottom-0 z-10 w-full cursor-ew-resize opacity-0"
            aria-valuetext={`${Math.round(pos)}% ${beforeLabel}`}
          />
        </div>
      </div>
    </section>
  );
}
