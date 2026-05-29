import type { IndustryTemplate } from "../types";

/**
 * Phase 4 close-out: sunglasses retail template (legacy).
 *
 * Reference fork for the original eyewear-shop archetype that Cartwright
 * grew out of (solbrillen.dk). Uses the legacy Product.frameColor /
 * lensColor / brand fields — the ONE place these are still preferred over
 * Product.attributes (JSON), because the storefront has hardcoded
 * frame/lens filter facets that read these specific columns.
 *
 * New retail forks (panel-hegn, pottery, coffee, etc.) MUST NOT use these
 * fields — they should use Product.attributes JSON instead. See
 * cartwright-private/CLAUDE.md "Hard rules" for the rationale.
 *
 * 3 stub products. Replace via /admin/produkter or extend the seed-data.
 */
export const sunglassesTemplate: IndustryTemplate = {
  label: "Sunglasses Shop (Legacy Eyewear)",
  description:
    "Eyewear retail using legacy frameColor/lensColor/brand fields. Reference fork for solbrillen.dk and existing eyewear customers. New non-eyewear forks should use Product.attributes JSON instead.",
  categories: [
    {
      name: "Men's",
      slug: "men",
      description: "Sunglasses for men — classic and contemporary frames.",
    },
    {
      name: "Women's",
      slug: "women",
      description: "Sunglasses for women — from oversized to minimalist.",
    },
  ],
  // Slug-mapping: matcher footer (components/Footer.tsx) Danish slugs
  // (om-os, faq, shipping, returns, terms, privacy) så routes går 200.
  pages: [
    {
      slug: "om-os",
      title: "Om Solbrillen.dk",
      body: `## Vores historie

Solbrillen.dk er en demo-shop bygget på Cartwright og en spejling af den oprindelige solbrillen.dk butik som engineen blev udtrukket fra. Vi sælger håndplukkede stel fra både ikoniske brands og mindre uafhængige designere.

## Kvalitet

Alle vores stel kommer med UV400-beskyttelse som standard. Acetat-stel er italienske; metalstel er let stål eller titanium. Optiske glas er trippel-anti-refleks og kan opgraderes til polariserede eller transitions.

## Optiker-samarbejde

Vi samarbejder med et lokalt optiker-værksted, så du kan få dine egne styrker monteret i et hvilket som helst stel fra vores katalog.`,
    },
    {
      slug: "faq",
      title: "Ofte stillede spørgsmål",
      body: `## Tilbyder I styrkeglas?

Ja — vælg et stel, og skriv din recept ved checkout. Vi sender stellet til vores optiker, der monterer dine glas. Du modtager varen 5-7 hverdage efter ordre.

## Hvad er jeres returret?

30 dages returret på ubrugte stel med original emballage. Med styrkeglas er stellet personliggjort, så returret bortfalder — men du kan reklamere over fabriksdefekter i 24 måneder.

## Er stellene polariserede?

Tjek det enkelte produkt. Premium-modeller (Wayfarer, Aviator) er polariserede; nogle modedrevne stel er ikke. Polarisering reducerer blænding fra vand, sne og biltage.

## Hvilken ansigtsform passer til hvilket stel?

Aviator passer rundt + hjerteformet; Wayfarer er allround; Oversized fungerer på smalle ansigter. Skriv til vores Stylist via chat-knappen for personlig rådgivning — eller brug den nye AI Stylist på siden.

## Hvor stammer stellene fra?

Vores acetat-stel produceres i Italien; metal-stel i Japan og Tyskland. Vi køber kun fra fabrikker med dokumenterede arbejdsforhold.`,
    },
    {
      slug: "shipping",
      title: "Fragt og levering",
      body: `## Fragtpriser

Standard-fragt i Danmark koster 49 kr og leveres med GLS 1-2 hverdage. Fri fragt på alle ordrer over 499 kr.

## Med styrkeglas

Stel med personlige glas tager 5-7 hverdage ekstra fordi vores optiker monterer manuelt. Du modtager opdateringer via email under hele processen.

## International levering

Vi sender til hele EU. Fragt beregnes ved checkout baseret på vægt og destination. Levering uden for EU er muligt på forespørgsel.

## Sporing

Tracking-nummer sendes på email så snart GLS henter pakken.`,
    },
    {
      slug: "returns",
      title: "Returnering og bytte",
      body: `## 30 dages returret

Ubrugte stel med original emballage og papirer kan returneres inden for 30 dage. Vi krediterer hele købet inklusive fragt.

## Med styrkeglas

Når et stel er udstyret med personlige glas, kan det ikke returneres pga. personliggørelsen. Vi reklamerer på fabriksdefekter i 24 måneder.

## Bytte

Vil du bytte til et andet stel? Skriv til support@solbrillen.demo, så hjælper vi dig.

## Sådan returnerer du

1. Skriv til support@solbrillen.demo med ordrenummer
2. Vi sender en returlabel
3. Pak stellet i original etui og emballage
4. Aflevér hos GLS — vi krediterer ved modtagelse`,
    },
    {
      slug: "terms",
      title: "Handelsbetingelser",
      body: `## Bestilling

Når du afgiver en ordre, indgår vi en købsaftale på de viste priser og vilkår. Priser er inklusive 25% moms.

## Betaling

Vi modtager betaling via Stripe (Visa, Mastercard, MobilePay). Beløbet trækkes når ordren bekræftes.

## Levering

Vi sender med GLS. Risikoen for varen overgår til dig ved levering.

## Reklamation

24 måneders købelovsgaranti gælder for fabriksdefekter. Slid og brud forårsaget af brug dækkes ikke.

## Persondata

Vi opbevarer kun de oplysninger du selv giver os. Se vores privatlivspolitik.

## Cartwright-demo

Dette er en demonstration af Cartwright-engineen. Solbrillen.dk er en canary-demo; betalingerne kører i Stripe test-mode (kort 4242 4242 4242 4242).`,
    },
    {
      slug: "privacy",
      title: "Privatlivspolitik",
      body: `## Hvilke data vi indsamler

Vi indsamler kun de data du selv giver os: navn, leveringsadresse, email, telefonnummer og — ved styrkeglas — din optiske recept. Vi gemmer ikke betalingskort; det håndteres af Stripe.

## Hvorfor

For at kunne sende dine briller og kontakte dig hvis der er problemer med ordren. Nyhedsbreve sendes kun hvis du har tilmeldt dem.

## Cookies

Nødvendige cookies (login, kurv, sikkerhed) er altid aktive. Analyse-cookies (GA4) loades kun hvis du har accepteret det i consent-banneret.

## Dine rettigheder (GDPR)

Du har ret til indsigt, berigtigelse og sletning af dine data. Skriv til admin@solbrillen.demo, så håndterer vi det inden for 30 dage.

## Demo-disclaimer

Dette er en Cartwright-demo. Du indtaster ikke rigtige betalingsdata; demo-data resettes natligt.`,
    },
  ],
  products: [
    {
      name: "Aviator Classic",
      slug: "aviator-classic",
      description:
        "Timeless aviator with gold metal frame and gradient lenses. UV400 protection.",
      priceDkk: 89900,
      images: [
        "https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=800",
      ],
      stock: 12,
      frameColor: "Gold",
      lensColor: "Brown gradient",
      brand: "Cartwright Classics",
      categorySlug: "men",
      featured: true,
    },
    {
      name: "Wayfarer Black",
      slug: "wayfarer-black",
      description:
        "Iconic wayfarer silhouette in matte black acetate. Polarized grey lenses.",
      priceDkk: 79900,
      images: [
        "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=800",
      ],
      stock: 18,
      frameColor: "Matte black",
      lensColor: "Polarized grey",
      brand: "Cartwright Classics",
      categorySlug: "men",
      featured: true,
    },
    {
      name: "Oversized Tortoise",
      slug: "oversized-tortoise",
      description:
        "Oversized round frame in tortoise acetate. Honey-tinted lenses, UV400.",
      priceDkk: 99900,
      images: [
        "https://images.unsplash.com/photo-1556015048-4d3aa10df74c?w=800",
      ],
      stock: 9,
      frameColor: "Tortoise",
      lensColor: "Honey",
      brand: "Cartwright Premium",
      categorySlug: "women",
      featured: true,
    },
  ],
};
