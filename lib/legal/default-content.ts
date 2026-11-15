import { brand } from "@/brand.config";

/**
 * Default "starter" legal-page content (privacy / terms / cookies) der falder ind
 * når der IKKE findes en CMS-Page med samme slug. Så canonical trust-links til /privacy,
 * /info/terms (+ /info/cookies) aldrig 404'er på en frisk shop, og GDPR/CCPA-kravet
 * om disse sider er dækket fra dag ét.
 *
 * VIGTIGT: Dette er SKABELONER, ikke juridisk rådgivning. De er generiske
 * GDPR-/dansk-handel-udgangspunkter templated fra brand.config (legalName, land,
 * kontakt-email, returdage). En shop BØR få sin egen jurist til at gennemgå og
 * tilpasse dem — opret en Page med samme slug i /admin/sider for at overskrive
 * denne default fuldstændigt.
 *
 * Body-format = samme markdown-agtige `## h2`-blokke som renderContentBlocks()
 * forventer (jf. Category.descriptionLong).
 */

const LEGAL_SLUGS = new Set(["privacy", "terms", "cookies"]);
const PUBLIC_FALLBACK_SLUGS = new Set([...LEGAL_SLUGS, "about", "contact"]);

function brandBits() {
  const company = brand.company as {
    legalName?: string;
    country?: string;
  };
  const contact = brand.contact as { email?: string };
  const policies = brand.policies as { returnDays?: number };
  return {
    store: brand.storeName,
    legalName: company.legalName || brand.storeName,
    country: company.country || "Danmark",
    email: contact.email || "",
    returnDays: policies.returnDays ?? 14,
  };
}

export function isLegalSlug(slug: string): boolean {
  return LEGAL_SLUGS.has(slug);
}

export function getDefaultLegalContent(
  slug: string,
  locale: string,
): { title: string; body: string } | null {
  if (!PUBLIC_FALLBACK_SLUGS.has(slug)) return null;
  const b = brandBits();
  // This module carries exactly two languages. Treating "not English" as
  // Danish handed a German/Swedish/Norwegian shop — all first-class in
  // i18n/routing.ts LOCALE_TAGS — a Danish privacy policy naming Datatilsynet.
  // English is the engine's neutral fallback for any locale without copy here.
  const en = locale !== "da";

  if (slug === "about") {
    return en
      ? {
          title: `About ${b.store}`,
          body: `## Who we are
${b.legalName} operates ${b.store} from ${b.country}. This site publishes our services, products and company information in a format that works for people, search engines and AI agents.

## What you can expect
Public content may be browsed without an account. Private information and operational changes are protected by authentication and explicit scopes. We aim to describe capabilities honestly and keep public policies easy to find.

## Contact
Questions about the company, this site or your data can be sent to ${b.email}.`,
        }
      : {
          title: `Om ${b.store}`,
          body: `## Hvem vi er
${b.legalName} driver ${b.store} fra ${b.country}. Sitet udgiver vores ydelser, produkter og virksomhedsoplysninger i et format, der fungerer for mennesker, søgemaskiner og AI-agenter.

## Hvad du kan forvente
Offentligt indhold kan læses uden en konto. Private oplysninger og driftsændringer er beskyttet af godkendelse og eksplicitte scopes. Vi beskriver funktioner ærligt og gør offentlige politikker nemme at finde.

## Kontakt
Spørgsmål om virksomheden, sitet eller dine data kan sendes til ${b.email}.`,
        };
  }

  if (slug === "contact") {
    return en
      ? {
          title: `Contact ${b.store}`,
          body: `## How to reach us
Email ${b.email} with questions about ${b.store}, an order, our public content or your personal data. Your message goes to the team responsible for the site and customer support.

## Help us respond well
Include the relevant product, page or order reference, but never send card details, passwords or API keys. We normally acknowledge genuine enquiries within one business day.

## Company
${b.legalName} operates ${b.store} from ${b.country}. Public agents may browse the site, while private information and operational changes always require authentication.`,
        }
      : {
          title: `Kontakt ${b.store}`,
          body: `## Sådan får du fat i os
Skriv til ${b.email} med spørgsmål om ${b.store}, en ordre, vores offentlige indhold eller dine personoplysninger. Din besked går til teamet bag sitet og kundeservice.

## Hjælp os med at svare godt
Medtag gerne relevant produkt, side eller ordrereference, men send aldrig kortoplysninger, adgangskoder eller API-nøgler. Vi kvitterer normalt for seriøse henvendelser inden for én hverdag.

## Virksomheden
${b.legalName} driver ${b.store} fra ${b.country}. Offentlige agenter må gennemse sitet, mens private oplysninger og driftsændringer altid kræver godkendelse.`,
        };
  }

  if (slug === "privacy") {
    return en
      ? {
          title: "Privacy Policy",
          body: `## Who we are
${b.legalName} ("we") operates ${b.store}. We are the data controller for the personal data described below. Contact us at ${b.email}.

## What we collect
We collect the data you give us when you create an account, place an order or contact us — name, email, phone, shipping address and order history. We also process technical data (IP, device, pages visited) to operate and secure the site.

## Why, and the legal basis
- To fulfil your orders and provide support (performance of a contract).
- To send transactional email such as order confirmations (contract / legitimate interest).
- For analytics and marketing only where you have consented (consent).

## Who we share it with
We share data only with the processors needed to run the shop — for example our payment provider (Stripe), email provider (Resend) and hosting/database providers — under data-processing agreements. We never sell your data.

## Your rights
Under the GDPR you can request access to, correction or deletion of your data, restrict or object to processing, and receive a copy of your data (portability). You can also withdraw consent at any time and lodge a complaint with your data-protection authority. To exercise any right, contact ${b.email}.

## Retention
We keep order and accounting data as required by law, and other personal data only as long as needed for the purposes above.

## Contact
Questions about this policy? Email ${b.email}.`,
        }
      : {
          title: "Privatlivspolitik",
          body: `## Hvem vi er
${b.legalName} ("vi") driver ${b.store}. Vi er dataansvarlig for de personoplysninger, der beskrives nedenfor. Kontakt os på ${b.email}.

## Hvad vi indsamler
Vi indsamler de oplysninger, du selv giver os, når du opretter en konto, afgiver en ordre eller kontakter os — navn, email, telefon, leveringsadresse og ordrehistorik. Vi behandler også tekniske data (IP, enhed, besøgte sider) for at drive og sikre sitet.

## Hvorfor — og retsgrundlaget
- For at gennemføre dine ordrer og yde support (opfyldelse af en aftale).
- For at sende transaktionsmails som ordrebekræftelser (aftale / legitim interesse).
- Til analyse og markedsføring kun hvis du har givet samtykke (samtykke).

## Hvem vi deler med
Vi deler kun data med de databehandlere, der er nødvendige for at drive shoppen — fx vores betalingsudbyder (Stripe), email-udbyder (Resend) og hosting/database-udbydere — under databehandleraftaler. Vi sælger aldrig dine data.

## Dine rettigheder
Efter GDPR kan du bede om indsigt i, berigtigelse eller sletning af dine data, begrænse eller gøre indsigelse mod behandling, og få en kopi af dine data (dataportabilitet). Du kan til enhver tid trække samtykke tilbage og klage til Datatilsynet. Kontakt ${b.email} for at gøre brug af en rettighed.

## Opbevaring
Vi gemmer ordre- og regnskabsdata så længe loven kræver, og andre personoplysninger kun så længe, det er nødvendigt til ovenstående formål.

## Kontakt
Spørgsmål til denne politik? Skriv til ${b.email}.`,
        };
  }

  if (slug === "terms") {
    return en
      ? {
          title: "Terms & Conditions",
          body: `## General
These terms apply to purchases from ${b.store}, operated by ${b.legalName}.

## Orders and prices
A binding agreement is formed when you receive an order confirmation. Prices are shown including applicable VAT unless stated otherwise. We reserve the right to correct obvious pricing errors.

## Payment
Payment is handled securely via our payment provider. Your card is charged when the order is placed.

## Delivery
We ship to the address you provide. Delivery times are estimates. Risk passes to you on delivery.

## Right of withdrawal & returns
You may return items within ${b.returnDays} days of receipt for a refund, provided they are in resalable condition. Contact ${b.email} to arrange a return.

## Liability
Nothing in these terms limits your statutory consumer rights. To the extent permitted by law, our liability is limited to the value of the order.

## Governing law
These terms are governed by the laws of ${b.country}. Questions? Email ${b.email}.`,
        }
      : {
          title: "Handelsbetingelser",
          body: `## Generelt
Disse betingelser gælder for køb hos ${b.store}, der drives af ${b.legalName}.

## Ordrer og priser
En bindende aftale indgås, når du modtager en ordrebekræftelse. Priser vises inkl. moms, medmindre andet er angivet. Vi forbeholder os ret til at rette åbenlyse prisfejl.

## Betaling
Betaling håndteres sikkert via vores betalingsudbyder. Dit kort trækkes, når ordren afgives.

## Levering
Vi sender til den adresse, du oplyser. Leveringstider er vejledende. Risikoen overgår til dig ved levering.

## Fortrydelsesret & returnering
Du kan returnere varer inden for ${b.returnDays} dage efter modtagelse og få pengene retur, forudsat varen er i salgbar stand. Kontakt ${b.email} for at aftale en returnering.

## Ansvar
Intet i disse betingelser begrænser dine ufravigelige forbrugerrettigheder. I det omfang loven tillader det, er vores ansvar begrænset til ordrens værdi.

## Lovvalg
Disse betingelser er underlagt lovgivningen i ${b.country}. Spørgsmål? Skriv til ${b.email}.`,
        };
  }

  // cookies
  return en
    ? {
        title: "Cookie Policy",
        body: `## What cookies are
Cookies are small files stored on your device. ${b.store} uses them to make the site work and — only with your consent — to measure traffic and personalise marketing.

## The categories we use
- **Necessary** — required for the site to function (cart, login, security). Always on.
- **Analytics** — help us understand how the site is used. Set only if you accept.
- **Marketing** — used to personalise offers. Set only if you accept.

## Managing your choice
You choose your preferences in the cookie banner, and can change them at any time. Blocking necessary cookies may break parts of the site.

## Contact
Questions? Email ${b.email}.`,
      }
    : {
        title: "Cookiepolitik",
        body: `## Hvad cookies er
Cookies er små filer, der gemmes på din enhed. ${b.store} bruger dem til at få sitet til at fungere og — kun med dit samtykke — til at måle trafik og personalisere markedsføring.

## Kategorierne vi bruger
- **Nødvendige** — kræves for at sitet virker (kurv, login, sikkerhed). Altid slået til.
- **Analyse** — hjælper os med at forstå, hvordan sitet bruges. Sættes kun, hvis du accepterer.
- **Markedsføring** — bruges til at personalisere tilbud. Sættes kun, hvis du accepterer.

## Sådan styrer du dit valg
Du vælger dine præferencer i cookie-banneret og kan ændre dem til enhver tid. Blokering af nødvendige cookies kan ødelægge dele af sitet.

## Kontakt
Spørgsmål? Skriv til ${b.email}.`,
      };
}
