import type { IndustryTemplate } from "../types";

/**
 * Phase 4 close-out: coffee shop template.
 *
 * Modern ecommerce reference fork — clean Product.attributes JSON for origin,
 * roast level, and tasting notes (the right way to model variant data per
 * the hard rule on legacy eyewear fields). Northbound demo on
 * teloz-showcase.vercel.app/da/produkter follows this template.
 *
 * 3 stub products. Add more via /admin/produkter or replace this seed-data
 * in a fork to fill out a real catalogue.
 */
export const coffeeTemplate: IndustryTemplate = {
  label: "Coffee Shop",
  description:
    "Single-origin coffee retail with realistic attributes (origin, roast level, tasting notes). Reference for modern Product.attributes usage.",
  categories: [
    {
      name: "Beans",
      slug: "beans",
      description: "Whole bean and ground coffee, sourced from single origins.",
    },
    {
      name: "Espresso",
      slug: "espresso",
      description: "Espresso blends optimised for milk-based drinks.",
    },
  ],
  // Slug-mapping: footer (components/Footer.tsx) linker til /info/om-os,
  // /info/faq, /info/shipping, /info/returns, /info/terms, /info/privacy.
  // Page slugs herunder skal matche så routes går 200, ikke 404. About-
  // siden lever som "om-os" så den danske URL går igennem. Engelske forks
  // kan tilføje en "about"-route der redirecter til "om-os" hvis ønsket.
  pages: [
    {
      slug: "om-os",
      showInNav: true,
      title: "Om Northbound",
      body: `## Vores historie

Northbound Coffee Roasters er en demo-shop bygget på Cartwright. Vi ristere bønner fra direct-trade-partnere i Etiopien, Colombia og Sumatra, så hver pose når dig inden for 48 timer fra rist.

## Sourcing

Vi køber direkte fra producenter vi har besøgt — ikke gennem brokers. Sporbarhed, fair priser og kvalitet over volumen.

## Risteri

Vores risteri ligger i København, og vi rister i små batches på en Probat L12 så hver origin får sin egen profil. Filterbønner får en let-medium ristning der bevarer syren; espresso-blends ristes lidt mørkere for body.`,
    },
    {
      slug: "faq",
      showInNav: true,
      title: "Ofte stillede spørgsmål",
      body: `## Hvor frisk er kaffen?

Vi rister på ordre. Forsendelse sker inden for 48 timer fra rist, og vi anbefaler at brygge inden for 4 uger.

## Hvordan opbevarer jeg bønnerne?

Lufttæt beholder, stuetemperatur, væk fra direkte sollys. Frys-bønner kun hvis du ikke kan brygge dem op inden for en måned.

## Tilbyder I abonnement?

Ja — kontakt os, så sætter vi en personlig leveringsplan op baseret på hvor meget kaffe I drikker.

## Hvor stammer bønnerne fra?

Vi sourcer single-origin fra Etiopien (Yirgacheffe), Colombia (Huila/Nariño) og Sumatra (Mandheling). Vores espresso-blend kombinerer 2-3 origins for body + sødme.`,
    },
    {
      slug: "shipping",
      title: "Fragt og levering",
      body: `## Fragtpriser

Standard-fragt i Danmark koster 39 kr og leveres med GLS 1-2 hverdage.

Fri fragt på alle ordrer over 499 kr (gælder hele sommeren).

## Risteplan

Vi rister tirsdag og fredag. Bestillinger placeret før kl. 10 risters samme dag og sendes dagen efter.

## International levering

Vi sender til hele EU. Fragt beregnes ved checkout baseret på vægt og destination.

## Sporing

Du modtager et tracking-nummer på email så snart pakken er afhentet af GLS.`,
    },
    {
      slug: "returns",
      title: "Returnering og bytte",
      body: `## 30 dages returret

Uåbnede poser kan returneres inden for 30 dage fra leveringsdato — vi krediterer hele købet inklusive fragt.

## Åbnede poser

Smagsoplevelse er subjektiv. Hvis du er utilfreds med en åbnet pose, skriv til os på support@northbound.demo og fortæl hvad du smagte. Vi sender enten en ny origin eller refunderer beløbet.

## Sådan returnerer du

1. Skriv til support@northbound.demo med ordrenummer
2. Vi sender en returlabel
3. Pak posen forsvarligt og aflevér hos GLS
4. Vi krediterer ved modtagelse`,
    },
    {
      slug: "terms",
      title: "Handelsbetingelser",
      body: `## Bestilling

Når du afgiver en ordre, indgår vi en købsaftale på de viste priser og vilkår. Priser er inklusive 25% moms.

## Betaling

Vi modtager betaling via Stripe (Visa, Mastercard, MobilePay). Beløbet trækkes når ordren risters og sendes.

## Levering

Vi sender med GLS. Risikoen for varen overgår til dig ved levering.

## Reklamation

24 måneders købelovsgaranti gælder for defekt emballage eller forkert leveret indhold. Smagsoplevelse falder uden for købeloven men dækkes af vores returpolitik.

## Persondata

Vi opbevarer kun de oplysninger du selv giver os ved bestilling. Se vores privatlivspolitik.

## Cartwright-demo

Dette er en demonstration af Cartwright-engineen. Northbound Coffee Roasters er ikke en rigtig butik; betalingerne kører i Stripe test-mode med kortet 4242 4242 4242 4242.`,
    },
    {
      slug: "privacy",
      title: "Privatlivspolitik",
      body: `## Hvilke data vi indsamler

Vi indsamler kun de data du selv giver os: navn, leveringsadresse, email og telefonnummer ved bestilling. Vi gemmer ikke betalingskort — det håndteres af Stripe.

## Hvorfor

For at kunne sende din kaffe og kontakte dig hvis der er problemer med ordren. Hvis du har tilmeldt nyhedsbrevet, bruger vi din email til det formål.

## Cookies

Vi bruger nødvendige cookies (login, kurv, sikkerhed) og — kun hvis du accepterer det — analytics-cookies (Google Analytics 4) der hjælper os forstå hvordan siden bruges.

## Dine rettigheder (GDPR)

Du har ret til indsigt, berigtigelse og sletning af dine data. Skriv til admin@northbound.demo, så håndterer vi det inden for 30 dage.

## Demo-disclaimer

Dette er en Cartwright-demo. Du indtaster ikke rigtige betalingsdata her; ordrer slettes natligt sammen med øvrig demo-data.`,
    },
  ],
  products: [
    {
      name: "Ethiopia Yirgacheffe",
      slug: "ethiopia-yirgacheffe",
      description:
        "Bright, floral single-origin from the Yirgacheffe region. Notes of bergamot, jasmine, and lemon. Best brewed as pour-over or AeroPress.",
      priceDkk: 14900,
      images: [
        "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=800",
      ],
      stock: 25,
      categorySlug: "beans",
      featured: true,
    },
    {
      name: "Colombia Supremo",
      slug: "colombia-supremo",
      description:
        "Balanced washed Colombian with caramel sweetness and chocolate finish. Works equally well as filter or espresso.",
      priceDkk: 12900,
      images: [
        "https://images.unsplash.com/photo-1611854779393-1b2da9d400fe?w=800",
      ],
      stock: 30,
      categorySlug: "beans",
      featured: true,
    },
    {
      name: "Northbound Espresso Blend",
      slug: "northbound-espresso-blend",
      description:
        "Our house blend, dialled for milk drinks. Chocolatey body with a stone-fruit lift. Roasted weekly.",
      priceDkk: 11900,
      images: [
        "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800",
      ],
      stock: 40,
      categorySlug: "espresso",
      featured: true,
    },
  ],
};
