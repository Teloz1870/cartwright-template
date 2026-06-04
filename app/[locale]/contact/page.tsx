import { getLocale } from "next-intl/server";
import { brand } from "@/brand.config";
import SmartContactForm from "@/components/SmartContactForm";
import { pageOg } from "@/lib/og";

const CONTACT_DESCRIPTION = `Kontakt ${brand.storeName} — spørgsmål, support og henvendelser.`;

export const metadata = {
  title: "Kontakt & Kundeservice",
  description: CONTACT_DESCRIPTION,
  ...pageOg("Kontakt & Kundeservice", CONTACT_DESCRIPTION),
};

/**
 * Kontakt-siden bruges af BÅDE ecommerce-shops (customer-support) og
 * SaaS-shops (sales-kontakt). Layout + design adapterer til mode:
 *
 *   isSaas (Teloz)         → dark bg + indigo accent (Antigravity-design)
 *   ecommerce-mode shop    → light bg + sol-accent tokens
 *
 * Copy læses fra brand.config (storeName, company.legalName, company.country,
 * contact.email) så fork-shops slipper for at edit'e denne fil.
 */
export default async function KontaktPage() {
  const locale = await getLocale();
  const isSaas =
    !brand.ecommerceEnabled && brand.industryTemplate === "saas";

  const wrapperClass = isSaas
    ? "min-h-screen bg-black pt-32 pb-24"
    : "min-h-screen bg-sol-cream dark:bg-sol-ink pt-32 pb-24";
  const headingClass = isSaas
    ? "text-6xl sm:text-8xl font-black text-white tracking-tighter mb-6 leading-[1.1]"
    : "text-6xl sm:text-8xl font-black text-sol-ink dark:text-white tracking-tighter mb-6 leading-[1.1]";
  const accentClass = isSaas
    ? "text-indigo-400"
    : "text-sol-accent";
  const bodyClass = isSaas
    ? "text-xl text-white/60 font-light leading-relaxed mb-10 max-w-2xl"
    : "text-xl text-sol-muted dark:text-white/60 font-light leading-relaxed mb-10 max-w-2xl";
  const cardClass = isSaas
    ? "bg-[#111] p-6 rounded-2xl border border-white/10"
    : "bg-white dark:bg-sol-sand p-6 rounded-2xl border border-sol-ink/10 dark:border-white/10";
  const cardHeadingClass = isSaas
    ? "text-lg font-bold text-white mb-4"
    : "text-lg font-bold text-sol-ink dark:text-white mb-4";
  const cardAddressClass = isSaas
    ? "not-italic text-sm text-white/60 space-y-2"
    : "not-italic text-sm text-sol-muted dark:text-white/60 space-y-2";
  const cardStrongClass = isSaas
    ? "text-white block mb-1"
    : "text-sol-ink dark:text-white block mb-1";
  const cardLinkClass = isSaas
    ? "font-bold text-indigo-400 hover:text-indigo-300 hover:underline"
    : "font-bold text-sol-accent hover:underline";

  const intro = isSaas
    ? `Har du spørgsmål til ${brand.storeName} eller brug for hjælp til din butik? Vores AI-assistent og menneskelige eksperter sidder klar til at hjælpe dig.`
    : `Har du spørgsmål eller brug for hjælp? Vi vender tilbage hurtigst muligt — typisk inden for 24 timer.`;

  return (
    <div className={wrapperClass}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 gap-16">
        <div>
          <h1 className={headingClass}>
            Kontakt <span className={accentClass}>Os</span>
          </h1>
          <p className={bodyClass}>{intro}</p>

          <div className={cardClass}>
            <h2 className={cardHeadingClass}>Virksomhedsoplysninger</h2>
            <address className={cardAddressClass}>
              <p>
                <strong className={cardStrongClass}>Ejet og drevet af:</strong>
                {brand.company?.legalName ?? brand.storeName}
                {brand.company?.country ? (
                  <>
                    <br />
                    {brand.company.country}
                  </>
                ) : null}
                {brand.company?.cvr ? (
                  <>
                    <br />
                    CVR: {brand.company.cvr}
                  </>
                ) : null}
              </p>
              {brand.contact?.email ? (
                <p className="pt-2">
                  <a
                    href={`mailto:${brand.contact.email}`}
                    className={cardLinkClass}
                  >
                    {brand.contact.email}
                  </a>
                </p>
              ) : null}
              {(() => {
                const phone = brand.contact?.phone;
                if (!phone) return null;
                return (
                  <p>
                    <a
                      href={`tel:${phone.replace(/\s+/g, "")}`}
                      className={cardLinkClass}
                    >
                      {phone}
                    </a>
                  </p>
                );
              })()}
              {brand.contact?.hours ? (
                <p className="pt-1 text-xs opacity-75">
                  {brand.contact.hours}
                </p>
              ) : null}
            </address>
          </div>
        </div>

        <div>
          <SmartContactForm mode={isSaas ? "saas" : "ecommerce"} locale={locale} />
        </div>
      </div>
    </div>
  );
}
