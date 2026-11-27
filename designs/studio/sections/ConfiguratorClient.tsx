"use client";

/**
 * Configurator — the interactive client island (useState). Kept separate from
 * StudioConfigurator.tsx so the schema + defaults live in a SERVER-importable
 * module: exports of a "use client" module become client references when read by
 * a Server Component (the section registry), which would strip the data. Mirrors
 * the heroAurora pattern (server wrapper + client child).
 */
import { useId, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import type { StudioConfiguratorProps } from "./StudioConfigurator";

/**
 * Was a fifth hand-rolled money formatter: `en-US` grouping in every locale,
 * with the currency glued on as a prefix regardless of where that currency
 * actually puts its symbol. Intl knows both; the locale comes from the reader.
 */
function money(currency: string, amount: number, locale: string) {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // The prop is a free-form string (a symbol like "kr" is legal here), so an
    // unknown ISO code is expected rather than exceptional.
    return `${currency}${amount.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
}

export function ConfiguratorClient({
  eyebrow,
  title,
  description,
  productName,
  basePrice,
  currency,
  groups,
  ctaLabel,
  ctaHref,
  note,
}: StudioConfiguratorProps) {
  const locale = useLocale();
  const baseId = useId();
  const [sel, setSel] = useState<number[]>(() => groups.map(() => 0));

  const total = useMemo(
    () => basePrice + groups.reduce((sum, g, gi) => sum + (g.choices[sel[gi]]?.priceDelta ?? 0), 0),
    [basePrice, groups, sel],
  );

  const colourGroup = groups.findIndex((g) => g.kind === "colour");
  const colour =
    colourGroup >= 0
      ? groups[colourGroup].choices[sel[colourGroup]]?.value ?? "#1f2937"
      : "var(--color-cw-terracotta, #c2630a)";
  const summary = groups.map((g, gi) => g.choices[sel[gi]]?.label).filter(Boolean).join(" · ");

  return (
    <section className="border-b border-cw-stone-200 bg-cw-paper dark:border-cw-stone-800 dark:bg-cw-stone-900/40">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        {(eyebrow || title || description) && (
          <div className="max-w-2xl">
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

        <div className="mt-12 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
          {/* PREVIEW */}
          <div className="relative flex min-h-[20rem] items-center justify-center overflow-hidden rounded-3xl border border-cw-stone-200 bg-cw-stone-50 p-8 dark:border-cw-stone-800 dark:bg-cw-stone-900">
            <div
              className="pointer-events-none absolute -top-1/3 left-1/2 size-[120%] -translate-x-1/2 rounded-full opacity-30 blur-3xl transition-colors duration-500"
              style={{ background: colour }}
              aria-hidden="true"
            />
            <div
              className="relative aspect-[4/5] w-44 rounded-[2rem] shadow-2xl ring-1 ring-black/10 transition-colors duration-500 sm:w-52"
              style={{ background: `linear-gradient(145deg, ${colour}, color-mix(in oklab, ${colour} 70%, #000))` }}
              aria-hidden="true"
            >
              <div className="absolute inset-x-5 top-5 h-1.5 rounded-full bg-white/25" />
              <div className="absolute inset-x-8 bottom-7 h-px bg-white/20" />
              <div className="absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 backdrop-blur-sm" />
            </div>
            <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between rounded-2xl bg-cw-paper/80 px-4 py-3 text-sm backdrop-blur-md dark:bg-cw-stone-900/80">
              <span className="font-medium text-cw-stone-900 dark:text-cw-stone-50">{productName}</span>
              <span className="font-mono text-cw-terracotta">{money(currency, total, locale)}</span>
            </div>
          </div>

          {/* CONTROLS */}
          <div className="flex flex-col gap-6">
            {groups.map((g, gi) => (
              <fieldset key={gi} className="border-0 p-0">
                <legend className="mb-2 flex w-full items-baseline justify-between font-mono text-xs uppercase tracking-[0.16em] text-cw-stone-500 dark:text-cw-stone-400">
                  <span>{g.label}</span>
                  <span className="normal-case tracking-normal text-cw-stone-400">{g.choices[sel[gi]]?.label}</span>
                </legend>
                <div className="flex flex-wrap gap-2">
                  {g.choices.map((c, ci) => {
                    const id = `${baseId}-${gi}-${ci}`;
                    const checked = sel[gi] === ci;
                    return (
                      <label
                        key={ci}
                        htmlFor={id}
                        className={
                          g.kind === "colour"
                            ? "group relative grid size-10 cursor-pointer place-items-center rounded-full ring-2 ring-offset-2 ring-offset-cw-paper transition-all has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cw-terracotta dark:ring-offset-cw-stone-900 " +
                              (checked ? "ring-cw-terracotta" : "ring-transparent hover:ring-cw-stone-300")
                            : "cursor-pointer rounded-full border px-4 py-2 text-sm font-medium transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cw-terracotta " +
                              (checked
                                ? "border-cw-terracotta bg-cw-terracotta text-white"
                                : "border-cw-stone-200 bg-cw-paper text-cw-stone-700 hover:border-cw-terracotta/50 dark:border-cw-stone-700 dark:bg-cw-stone-900 dark:text-cw-stone-300")
                        }
                        title={c.label}
                      >
                        <input
                          id={id}
                          type="radio"
                          name={`${baseId}-${gi}`}
                          className="sr-only"
                          checked={checked}
                          onChange={() => setSel((s) => s.map((v, idx) => (idx === gi ? ci : v)))}
                        />
                        {g.kind === "colour" ? (
                          <>
                            <span className="size-7 rounded-full" style={{ background: c.value }} />
                            <span className="sr-only">{c.label}</span>
                          </>
                        ) : (
                          <span>
                            {c.label}
                            {c.priceDelta > 0 && (
                              <span className={checked ? "ml-1.5 text-white/70" : "ml-1.5 text-cw-stone-400"}>
                                +{money(currency, c.priceDelta, locale)}
                              </span>
                            )}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}

            <div className="mt-2 flex flex-wrap items-center justify-between gap-4 border-t border-cw-stone-200 pt-5 dark:border-cw-stone-800">
              <div>
                <div className="font-mono text-xs uppercase tracking-[0.16em] text-cw-stone-400">Your total</div>
                <div className="text-3xl font-semibold tracking-tight text-cw-stone-900 dark:text-cw-stone-50">
                  {money(currency, total, locale)}
                </div>
              </div>
              <a
                href={ctaHref}
                className="rounded-full bg-cw-terracotta px-6 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
              >
                {ctaLabel}
              </a>
            </div>
            <p className="text-sm text-cw-stone-500 dark:text-cw-stone-400">
              <span className="text-cw-stone-400">Configured:</span> {summary}
            </p>
            {note && <p className="font-mono text-xs text-cw-stone-400">{note}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
