import { getLocale } from "next-intl/server";
import SmartContactForm from "@/components/SmartContactForm";
import { getActiveDesign } from "@/lib/theme";
import { buildContactMetadata } from "@/lib/contact-metadata";
import { getBrand } from "@/lib/brand";
import { fetchContactPage } from "@/lib/data-source/nav";
import { getDefaultLegalContent } from "@/lib/legal/default-content";
import {
  renderContentBlocks,
  renderInlineMarkdown,
  type ContentBlock,
} from "@/lib/content";
import { getDynamicTranslation } from "@/lib/i18n-dynamic";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  return buildContactMetadata(locale);
}

function splitHeadingBlocks(blocks: ContentBlock[]): ContentBlock[] {
  return blocks.flatMap((block): ContentBlock[] => {
    if (block.type !== "heading" || !block.text.includes("\n")) return [block];
    const [heading, ...body] = block.text.split("\n");
    const rest = body.join("\n").trim();
    return [
      { type: "heading", text: heading.trim() },
      ...(rest ? [{ type: "paragraph" as const, text: rest }] : []),
    ];
  });
}

function ContactProse({ blocks, dark }: { blocks: ContentBlock[]; dark: boolean }) {
  return (
    <div className="mb-10 max-w-2xl space-y-4">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <h2
              key={index}
              className={`pt-3 text-lg font-bold ${dark ? "text-white" : "text-sol-ink dark:text-white"}`}
            >
              {block.text}
            </h2>
          );
        }
        if (block.type === "quote") {
          return (
            <blockquote
              key={index}
              className={`border-l-2 pl-4 text-base leading-7 ${dark ? "border-white/20 text-white/70" : "border-sol-accent text-sol-muted dark:text-white/70"}`}
            >
              {renderInlineMarkdown(block.text)}
            </blockquote>
          );
        }
        return (
          <p
            key={index}
            className={`text-base leading-7 ${dark ? "text-white/65" : "text-sol-muted dark:text-white/65"}`}
          >
            {renderInlineMarkdown(block.text)}
          </p>
        );
      })}
    </div>
  );
}

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

  const [resolvedBrand, contactPage] = await Promise.all([
    getBrand(),
    fetchContactPage().catch(() => {
      // The fallback contains no private data and keeps this trust anchor
      // available during a DB outage. Provider errors are deliberately not
      // logged verbatim because connection strings may be embedded in them.
      console.error("[contact] Published CMS content is temporarily unavailable.");
      return null;
    }),
  ]);
  const fallback = getDefaultLegalContent("contact", locale)!;
  const pageTitle = contactPage
    ? await getDynamicTranslation(contactPage, "title", contactPage.title)
    : fallback.title;
  const pageBody = contactPage
    ? await getDynamicTranslation(contactPage, "body", contactPage.body)
    : fallback.body;
  const contentBlocks = splitHeadingBlocks(renderContentBlocks(pageBody));

  // Design-owned contact template (DesignPack.pages.contact) — renders inside the
  // design's Shell + chrome. Unset → the default body below (byte-identical).
  const activeDesign = await getActiveDesign().catch(() => null);
  const ContactTemplate = activeDesign?.pages?.contact;
  if (ContactTemplate) {
    return (
      <ContactTemplate
        locale={locale}
        title={pageTitle}
        blocks={contentBlocks}
      />
    );
  }

  const isSaas =
    !resolvedBrand.ecommerceEnabled && resolvedBrand.industryTemplate === "saas";

  const wrapperClass = isSaas
    ? "min-h-screen bg-black pt-32 pb-24"
    : "min-h-screen bg-sol-cream dark:bg-sol-ink pt-32 pb-24";
  const headingClass = isSaas
    ? "text-6xl sm:text-8xl font-black text-white tracking-tighter mb-6 leading-[1.1]"
    : "text-6xl sm:text-8xl font-black text-sol-ink dark:text-white tracking-tighter mb-6 leading-[1.1]";
  const accentClass = isSaas
    ? "text-[var(--cw-brand-on-dark)]"
    : "text-sol-accent";
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
    ? "font-bold text-[var(--cw-brand-on-dark)] hover:text-[var(--cw-brand-on-dark-hi)] hover:underline"
    : "font-bold text-sol-accent hover:underline";

  return (
    <div className={wrapperClass}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 gap-16">
        <div>
          <h1 className={headingClass}>
            <span className={accentClass}>{pageTitle}</span>
          </h1>
          <ContactProse blocks={contentBlocks} dark={isSaas} />

          <div className={cardClass}>
            <h2 className={cardHeadingClass}>Virksomhedsoplysninger</h2>
            <address className={cardAddressClass}>
              <p>
                <strong className={cardStrongClass}>Ejet og drevet af:</strong>
                {resolvedBrand.company?.legalName ?? resolvedBrand.storeName}
                {resolvedBrand.company?.country ? (
                  <>
                    <br />
                    {resolvedBrand.company.country}
                  </>
                ) : null}
                {resolvedBrand.company?.cvr ? (
                  <>
                    <br />
                    CVR: {resolvedBrand.company.cvr}
                  </>
                ) : null}
              </p>
              {resolvedBrand.contact?.email ? (
                <p className="pt-2">
                  <a
                    href={`mailto:${resolvedBrand.contact.email}`}
                    className={cardLinkClass}
                  >
                    {resolvedBrand.contact.email}
                  </a>
                </p>
              ) : null}
              {(() => {
                const phone = resolvedBrand.contact?.phone;
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
              {resolvedBrand.contact?.hours ? (
                <p className="pt-1 text-xs opacity-75">
                  {resolvedBrand.contact.hours}
                </p>
              ) : null}
            </address>
          </div>
        </div>

        <div>
          <SmartContactForm
            mode={isSaas ? "saas" : "ecommerce"}
            locale={locale}
            attachmentsEnabled={Boolean(
              (resolvedBrand.features as { contactAttachments?: boolean })
                .contactAttachments,
            )}
          />
        </div>
      </div>
    </div>
  );
}
