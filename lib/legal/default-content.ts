import { brand } from "@/brand.config";

/**
 * Default "starter" legal-page content (privacy / terms / cookies) der falder ind
 * når der IKKE findes en CMS-Page med samme slug. Så footer-links til /info/privacy,
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
  if (!LEGAL_SLUGS.has(slug)) return null;
  const b = brandBits();
  const en = locale === "en";

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
