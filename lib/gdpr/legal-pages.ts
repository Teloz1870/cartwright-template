import "server-only";

import { prisma } from "@/lib/db";
import { brand } from "@/brand.config";

/**
 * Default juridiske sider (privacy/terms/cookies). ensureLegalPages opretter dem
 * KUN hvis de mangler — eksisterende sider røres aldrig. Fixer det brudte
 * /info/privacy-link (footeren peger på det, men ingen seed oprettede siden).
 *
 * Indholdet er boilerplate operatøren BØR gennemgå/tilpasse — det refererer
 * processor-registeret + DSAR-rettighederne, men er ikke juridisk rådgivning.
 */

const support = brand.emails?.support ?? "support@example.com";
const store = brand.storeName;

const PRIVACY_BODY = `## Privatlivspolitik

${store} behandler dine personoplysninger ansvarligt og i overensstemmelse med GDPR.

### Hvilke data vi indsamler
Konto (navn, email, telefon), ordrer (leveringsadresse, beløb), eventuelle
anmeldelser og henvendelser. Vi indsamler kun det nødvendige.

### Hvad vi bruger dem til
Ekspedition af ordrer, kundeservice, og — hvis du har givet samtykke — analyse.

### Databehandlere
Vi deler data med betroede databehandlere (betaling, email, hosting, m.fl.). Se
det fulde register internt; alle er underlagt databehandleraftaler hvor påkrævet.

### Dine rettigheder
Du har ret til indsigt, berigtigelse og sletning. Hent alle dine data via din
konto (data-eksport), eller kontakt os på ${support} for at få dem slettet.

### Kontakt
Spørgsmål om privatliv: ${support}.`;

const TERMS_BODY = `## Handelsbetingelser

Disse betingelser gælder for køb hos ${store}.

### Bestilling og betaling
Priser vises inkl. moms. Betaling sker via de viste betalingsmetoder.

### Levering
Leveringstid og -pris fremgår ved checkout. Vi leverer til de lande der er angivet.

### Fortrydelsesret
Du har 14 dages fortrydelsesret fra modtagelse i henhold til forbrugeraftaleloven.

### Reklamation
Købeloven giver dig op til 24 måneders reklamationsret. Kontakt ${support}.`;

const COOKIES_BODY = `## Cookiepolitik

${store} bruger cookies for at få sitet til at fungere og — med dit samtykke — til
analyse.

### Kategorier
- **Nødvendige**: kræves for at sitet virker (kurv, login). Kan ikke fravælges.
- **Analyse**: hjælper os med at forstå brug. Kun med samtykke.
- **Marketing**: kun med samtykke.

### Samtykke
Du styrer dit samtykke via cookie-banneret. Du kan til enhver tid ændre det.`;

export type LegalPageSpec = { slug: string; title: string; body: string };

export const LEGAL_PAGES: readonly LegalPageSpec[] = [
  { slug: "privacy", title: "Privatlivspolitik", body: PRIVACY_BODY },
  { slug: "terms", title: "Handelsbetingelser", body: TERMS_BODY },
  { slug: "cookies", title: "Cookiepolitik", body: COOKIES_BODY },
];

export type EnsureLegalResult = { created: string[]; existing: string[] };

/** Opret manglende juridiske sider. Eksisterende sider røres ALDRIG. */
export async function ensureLegalPages(): Promise<EnsureLegalResult> {
  const created: string[] = [];
  const existing: string[] = [];
  for (const page of LEGAL_PAGES) {
    const found = await prisma.page.findUnique({
      where: { slug: page.slug },
      select: { slug: true },
    });
    if (found) {
      existing.push(page.slug);
      continue;
    }
    await prisma.page.create({
      data: { slug: page.slug, title: page.title, body: page.body, showInNav: false },
    });
    created.push(page.slug);
  }
  return { created, existing };
}

/** Status pr. juridisk side (til admin-visning) uden at oprette noget. */
export async function legalPageStatus(): Promise<
  { slug: string; title: string; exists: boolean }[]
> {
  const rows = await prisma.page.findMany({
    where: { slug: { in: LEGAL_PAGES.map((p) => p.slug) } },
    select: { slug: true },
  });
  const present = new Set(rows.map((r) => r.slug));
  return LEGAL_PAGES.map((p) => ({
    slug: p.slug,
    title: p.title,
    exists: present.has(p.slug),
  }));
}
