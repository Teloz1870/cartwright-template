/**
 * Crema — listing-page frame (DesignPack.webshop.plpLayout).
 *
 * The default PLP opens with a stock-photo hero band — the one surface that
 * still read "template" on the demo's second click. Crema replaces it with an
 * editorial shelf head: mono kicker, an oversized Fraunces headline with an
 * italic copper accent, and the live item count as a ledger line. 1px
 * hairlines instead of shadows; the entrance reuses the hero's staggered
 * `crema-enter` reveal (reduced-motion safe: visible by default).
 *
 * `children` = the engine's breadcrumb (when enabled) + filters + grid.
 * The `heading` prop (config uiLabels, single-language) is deliberately
 * ignored — the pack's i18n-from-birth rule renders its own localized copy
 * from the `Crema` namespace, so /da and /en both read correctly regardless
 * of config. `.crema-plp` in crema.css restyles the filter sidebar (dark
 * panels, hairline borders) without touching the shared component.
 */
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cremaFontVars } from "../fonts";
import "../crema.css";

export function CremaPlpFrame({
  children,
  productCount,
}: {
  children: ReactNode;
  heading: string;
  productCount: number;
  locale: string;
}) {
  const t = useTranslations("Crema");

  return (
    <div className={`${cremaFontVars} crema-scope crema-plp`}>
      <header className="crema-plp-head">
        <div className="mx-auto max-w-7xl px-6">
          <p className="crema-kicker" data-crema-stagger style={{ "--i": 0 } as React.CSSProperties}>
            {t("plpKicker")}
          </p>
          <h1
            className="crema-display crema-plp-title"
            data-crema-stagger
            style={{ "--i": 1 } as React.CSSProperties}
          >
            {t.rich("plpTitle", {
              em: (chunks) => <em>{chunks}</em>,
            })}
          </h1>
          <p
            className="crema-plp-count"
            data-crema-stagger
            style={{ "--i": 2 } as React.CSSProperties}
          >
            {t("plpCount", { count: productCount })}
          </p>
        </div>
      </header>
      {children}
    </div>
  );
}
