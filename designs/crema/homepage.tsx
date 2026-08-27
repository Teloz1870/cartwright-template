/**
 * Crema — cinematic dark-roast homepage (Server Component).
 *
 * Photography-led, copper-accented, i18n from birth: every string flows
 * through the `Crema` namespace, every internal link carries /{locale} and
 * the CANONICAL slugs (/product/, /about — see #459). Prices render through
 * the shared <Price> so currency follows brand policy, never a hardcoded kr.
 */
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { brand } from "@/brand.config";
import { Price } from "@/components/Price";
import { editAttr } from "@/components/annotate/editAttr";
import { resolveProductImageUrls } from "@/lib/media/shim";
import type { DesignHomepageProps } from "../types";
import { CremaAgentStrip } from "./AgentStrip";
import { cremaFontVars } from "./fonts";
import { BrewCalculator } from "./webshop/BrewCalculator";
import BrewWebMcpMount from "./webshop/BrewWebMcpMount";
import { parseLocalizedCoffeeAttributes } from "./webshop/attributes";
import "./crema.css";

/** Dekorative rist-niveauer — deterministisk pr. indeks (ingen Math.random i RSC). */
const ROAST_LEVELS = [3, 2, 4, 2, 3, 4];

export default async function CremaHomepage({
  settings,
  locale,
  featured = [],
  categories = [],
  editEnabled = false,
  agentApiEnabled = false,
}: DesignHomepageProps) {
  const t = await getTranslations({ locale, namespace: "Crema" });
  const poster = settings?.heroImage || undefined;
  const bar = featured.slice(0, 4);
  const freeShipKr = Math.floor(
    (brand.policies?.shippingFreeThresholdDkk || 49900) / 100,
  );

  return (
    <div className={`crema-root ${cremaFontVars}`}>
      {/* ───── 1. HERO — video under en rist-gradient ───── */}
      <section className="crema-hero">
        <div className="crema-hero-media" aria-hidden>
          {/* Poster bærer billedet når video mangler/reduceres; onError-fri:
              en 404'et video viser blot posteren. */}
          <video autoPlay muted loop playsInline poster={poster} src="/hero/hero-v1.mp4" />
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element -- baggrundslag bag videoen; Image-optimering unødig her
            <img src={poster} alt="" />
          ) : null}
        </div>
        <div className="crema-hero-veil" aria-hidden />

        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-20 pt-40 sm:pb-24">
          <p className="crema-kicker" data-crema-stagger style={{ "--i": 0 } as React.CSSProperties}>
            {t("kicker")}
          </p>
          <h1
            className="crema-display crema-h1 mt-6 max-w-3xl"
            data-crema-stagger
            style={{ "--i": 1 } as React.CSSProperties}
            {...editAttr({ kind: "setting", field: "websiteHeadline" }, editEnabled)}
          >
            {settings?.websiteHeadline || (
              <>
                {t("heroA")} <em>{t("heroB")}</em>
              </>
            )}
          </h1>
          <p
            className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--crema-muted)]"
            data-crema-stagger
            style={{ "--i": 2 } as React.CSSProperties}
            {...editAttr({ kind: "setting", field: "tagline" }, editEnabled)}
          >
            {settings?.tagline || t("sub")}
          </p>
          <div
            className="mt-10 flex flex-wrap items-center gap-4"
            data-crema-stagger
            style={{ "--i": 3 } as React.CSSProperties}
          >
            <Link href={`/${locale}/produkter`} className="crema-cta">
              {t("ctaShop")}
            </Link>
            <Link href={`/${locale}/about`} className="crema-cta-ghost">
              {t("ctaStory")}
            </Link>
          </div>
          <p
            className="mt-10 font-[family-name:var(--font-crema-mono)] text-[11px] uppercase tracking-[0.28em] text-[var(--crema-muted)]"
            data-crema-stagger
            style={{ "--i": 4 } as React.CSSProperties}
          >
            {t("heroMeta", { amount: freeShipKr })}
          </p>
        </div>
      </section>

      {/* ───── 2. BAREN — featured som samling ───── */}
      {bar.length > 0 ? (
        <section className="crema-section">
          <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
            <header className="crema-rise mb-12 flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="crema-eyebrow">{t("barEyebrow")}</p>
                <h2 className="crema-display crema-h2 mt-3">{t("barTitle")}</h2>
              </div>
              <Link
                href={`/${locale}/produkter`}
                className="font-[family-name:var(--font-crema-mono)] text-xs uppercase tracking-[0.24em] text-[var(--crema-copper-hi)] hover:underline"
              >
                {t("barAll")}
              </Link>
            </header>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {bar.map((product, i) => {
                // KZ-porten: dots/origin er DATA-drevne når Product.attributes
                // er sat; uden attributes falder kortet tilbage til de
                // dekorative niveauer (aldrig-gæt gælder KUN faktatekst —
                // origin-badge/roast-NAVN udelades uden data).
                const attrs = parseLocalizedCoffeeAttributes(product, locale);
                const roastLevel =
                  attrs.roast ?? ROAST_LEVELS[i % ROAST_LEVELS.length] ?? 3;
                // Billeder løses gennem media-shim'et (images-JSON → MediaAsset
                // → imageUrl) — `imageUrl` alene er tom på de fleste rigtige
                // kataloger, og kortet stod uden foto.
                const cardImage = resolveProductImageUrls(product)[0] ?? null;
                return (
                <Link
                  key={product.id}
                  href={`/${locale}/product/${product.slug}`}
                  className="crema-card crema-rise group block"
                >
                  <div className="crema-card-media">
                    {cardImage ? (
                      <Image
                        src={cardImage}
                        alt={product.name}
                        fill
                        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                      />
                    ) : null}
                    {/* videoUrl-featuren: filmisk kort-loop oven på stillbilledet;
                        reduced-motion skjuler videoen og lader billedet stå. */}
                    {product.videoUrl ? (
                      <video
                        className="crema-pcard-video"
                        src={product.videoUrl}
                        poster={cardImage ?? undefined}
                        autoPlay
                        muted
                        loop
                        playsInline
                      />
                    ) : null}
                    {attrs.origin ? (
                      <span className="crema-pcard-badge">{attrs.origin}</span>
                    ) : null}
                  </div>
                  <div className="space-y-3 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="crema-dots" aria-hidden>
                        {[1, 2, 3, 4].map((dot) => (
                          <i
                            key={dot}
                            {...(dot <= roastLevel ? { "data-on": "" } : {})}
                          />
                        ))}
                      </span>
                      <span className="font-[family-name:var(--font-crema-mono)] text-[10px] uppercase tracking-[0.2em] text-[var(--crema-muted)]">
                        {attrs.roast !== null
                          ? t(`cardRoast${attrs.roast}`)
                          : t("roastLabel")}
                      </span>
                    </div>
                    <h3 className="crema-display text-2xl leading-tight">
                      {product.name}
                    </h3>
                    {product.description ? (
                      <p className="line-clamp-2 text-sm leading-relaxed text-[var(--crema-muted)]">
                        {product.description}
                      </p>
                    ) : null}
                    <p className="pt-1 text-lg font-semibold text-[var(--crema-copper-hi)]">
                      <Price oere={product.priceDkk} />
                    </p>
                  </div>
                </Link>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {/* ───── 3. UGEN — tre trin ───── */}
      <section className="crema-section">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <p className="crema-eyebrow crema-rise">{t("weekEyebrow")}</p>
          <div className="mt-10 grid grid-cols-1 gap-12 md:grid-cols-3">
            {([1, 2, 3] as const).map((step) => (
              <div key={step} className="crema-rise">
                <span className="crema-numeral">{String(step).padStart(2, "0")}</span>
                <h3 className="crema-display mt-4 text-2xl">{t(`step${step}Title`)}</h3>
                <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--crema-muted)]">
                  {t(`step${step}Body`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── 3b. BRYGBEREGNEREN — ekkoet af KZ's materiale-beregner ───── */}
      <section className="crema-section">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <div className="crema-rise">
            <p className="crema-eyebrow">{t("calcEyebrow")}</p>
            <h2 className="crema-display crema-h2 mt-3 max-w-xl">
              {t("calcTitle")}
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--crema-muted)]">
              {t("calcBody")}
            </p>
          </div>
          <div className="crema-rise mt-10">
            <BrewCalculator
              labels={{
                cups: t("calcCups"),
                cupsHint: t("calcCupsHint"),
                strength: t("calcStrength"),
                ratio: {
                  15: t("calcRatio15"),
                  16: t("calcRatio16"),
                  17: t("calcRatio17"),
                },
                coffee: t("calcCoffee"),
                water: t("calcWater"),
              }}
            />
            {/* WebMCP: the calculator's math as the pack's own agent tool
                (gate inside the mount — flag off ⇒ zero bytes). */}
            <BrewWebMcpMount />
          </div>
        </div>
      </section>

      {/* ───── 4. HYLDERNE — kategorier som typografiske fliser ───── */}
      {categories.length > 0 ? (
        <section className="crema-section">
          <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
            <p className="crema-eyebrow crema-rise">{t("shelvesEyebrow")}</p>
            <div className="mt-8">
              {categories.map((category, idx) => (
                <Link
                  key={category.id}
                  href={`/${locale}/category/${category.slug}`}
                  className="crema-tile crema-rise group"
                >
                  <span className="font-[family-name:var(--font-crema-mono)] text-sm text-[var(--crema-copper)]">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span className="crema-tile-name crema-display text-4xl transition-colors sm:text-5xl">
                    {category.name}
                  </span>
                  <span
                    aria-hidden
                    className="ml-auto text-[var(--crema-muted)] opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ───── 4b. AGENT-KLAR — live, uafhængigt målt score (kun når
             agent-API'et faktisk er eksponeret; capability-aware discovery) ───── */}
      {agentApiEnabled ? <CremaAgentStrip locale={locale} /> : null}

      {/* ───── 5. BREVET ───── */}
      <section className="crema-section">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <div className="crema-letter crema-rise mx-auto max-w-3xl px-8 py-14 text-center sm:px-14">
            <p className="font-[family-name:var(--font-crema-mono)] text-[10px] uppercase tracking-[0.3em]">
              {t("letterEyebrow")}
            </p>
            <h2 className="crema-display mt-4 text-3xl leading-tight sm:text-4xl">
              {t("letterTitle")}
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed opacity-70">
              {t("letterBody")}
            </p>
            <form
              action="/api/newsletter/subscribe"
              method="post"
              className="mx-auto mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row"
            >
              <input
                name="email"
                type="email"
                required
                placeholder={t("emailPlaceholder")}
                className="h-12 flex-1 rounded-full px-5 font-[family-name:var(--font-crema-mono)] text-sm focus:outline-none"
              />
              <button
                type="submit"
                className="h-12 whitespace-nowrap rounded-full px-8 text-xs font-bold uppercase tracking-[0.2em] transition-colors"
              >
                {t("subscribe")}
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
