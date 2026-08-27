/**
 * Crema — PDP frame (DesignPack.webshop.pdpLayout, the halo pattern).
 *
 * Wraps the default product-detail tree in the crema dark canvas: a title band
 * with its own breadcrumb (→ `ownsBreadcrumb: true` in the pack, so the shared
 * route breadcrumb skips this page), the origin · process eyebrow and the
 * data-driven roast dots. The functional body (gallery, variants, add-to-cart,
 * the engine's generic attribute spec-table) stays untouched inside `children`;
 * `.crema-pdp` in crema.css restyles it — Fraunces on the product h1, sticky
 * buy column on desktop — without touching the route.
 *
 * Attribute elements follow the never-guess rule: missing/unparseable → the
 * band simply renders without that element.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { DesignProduct } from "../../types";
import { cremaFontVars } from "../fonts";
import { parseLocalizedCoffeeAttributes } from "./attributes";
import "../crema.css";

export function CremaPdpLayout({
  product,
  children,
}: {
  product: DesignProduct;
  children: ReactNode;
}) {
  const locale = useLocale();
  const t = useTranslations("Crema");
  const a = parseLocalizedCoffeeAttributes(product, locale);
  const roast = a.roast;
  const eyebrow = [a.origin, a.process].filter(Boolean).join(" · ");

  return (
    <div className={`${cremaFontVars} crema-scope crema-pdp`}>
      <div className="mx-auto max-w-7xl px-6 pt-8">
        <nav aria-label="Breadcrumb" className="crema-pdp-crumb">
          <Link href={`/${locale}/produkter`}>{t("pdpCrumb")}</Link>
          <span aria-hidden className="px-2 opacity-50">
            /
          </span>
          <span className="text-[var(--crema-foam)]">{product.name}</span>
        </nav>

        {eyebrow || roast !== null ? (
          <div className="crema-pdp-band">
            {eyebrow ? <span className="crema-eyebrow">{eyebrow}</span> : null}
            {roast !== null ? (
              <span className="crema-pdp-roast">
                <span className="crema-dots" aria-hidden>
                  {[1, 2, 3, 4].map((dot) => (
                    <i key={dot} {...(dot <= roast ? { "data-on": "" } : {})} />
                  ))}
                </span>
                {t(`cardRoast${roast}`)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
