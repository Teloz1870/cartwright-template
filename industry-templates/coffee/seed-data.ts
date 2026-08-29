import type { IndustryTemplate } from "../types";
import { formatPrice } from "@/lib/format";
import { brand } from "@/brand.config";

/**
 * A shipping amount, written the way THIS shop writes money.
 *
 * Two things had to be true at once. The rate has to come from
 * `brand.policies`, or seeded prose drifts from what the cart actually charges
 * — the live coffee demo promised 39 kr on this very page while its config
 * said 6 kr and its Product JSON-LD published `6.00 DKK`. And the number has
 * to be formatted in the shop's OWN language: `formatPrice` defaults DKK to
 * da-DK, so an English page generated with the default would read "39,00 kr."
 * — the Danish thousands/decimal convention inside English prose, which is the
 * exact defect this branch exists to end. Passing `brand.defaultLocale` gives
 * "DKK 39.00" on an English shop and "39,00 kr." on a Danish one.
 */
/**
 * The language this template is AUTHORED in. Declared once because the seeded
 * copy is written in it and must be formatted in it — `orientSeedPage` moves
 * this body into `translations.en` when the shop's default locale is something
 * else, so formatting it with `brand.defaultLocale` would put Danish-style
 * "49,00 kr." inside the English page that /en then renders. Every seeded
 * amount names the locale of the prose it sits in, never the shop's.
 */
const SOURCE_LOCALE = "en";

const shippingAmount = (minor: number, locale: string) =>
  formatPrice(minor, { locale });

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
  // The pages below are written in English; the Danish original lives under
  // each page's `translations.da`. Declaring the source language lets the
  // seeder rotate a Danish-base shop into its own locale instead of serving
  // it English on /da (see industry-templates/seed-locale.ts).
  sourceLocale: SOURCE_LOCALE,
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
  // Slug mapping: the footer's trust links resolve to /info/shipping,
  // /info/returns, /info/terms, /info/privacy, and About is served from the
  // stable /about route, which resolves BOTH the modern `about` slug and the
  // legacy Danish `about` source slug `om-os` (lib/canonical-public-routes.ts).
  // The seed keeps `om-os` as the SOURCE slug so existing coffee forks and the
  // Northbound canary keep their row identity. The canonical public path is
  // /<locale>/about in every locale: proxy.ts redirects /<locale>/info/om-os
  // there (canonicalTrustRedirect), and the sitemap and llms.txt emit only the
  // canonical path — so the Danish slug is never an indexable URL. It IS still
  // the href the nav renders for this page (HeaderClient builds /info/<slug>
  // straight from the row), i.e. one redirect hop on click.
  //
  // The shipping page quotes `brand.policies.shippingDefaultDkk` and
  // `shippingFreeThresholdDkk` in words. Those two numbers are what the cart,
  // the checkout and the public Offer JSON-LD actually charge and publish, so
  // seeded prose that disagrees makes the shop contradict itself in public —
  // which is exactly what the live coffee demo does today: its page promises
  // 39 kr while its JSON-LD serves `"value":"6.00","currency":"DKK"`, a
  // leftover from a spell when that overlay was briefly a US store.
  // `tests/unit/coffee-shipping-copy.test.ts` pins the two together.
  //
  // Copy is ENGLISH-FIRST. `title`/`body` are the base (source) text, which
  // `getDynamicTranslation` returns whenever the request locale IS
  // `brand.defaultLocale`; the original Danish lives under `translations.da`
  // and is served to /da visitors on any shop that lists `da` in
  // `brand.locales` without making it the default. That is exactly the shape
  // both consumers have: `create-cartwright` scaffolds are born
  // `defaultLocale: "en"` (en-only), and the Northbound demo runs
  // `defaultLocale: "en"` with `locales: ["da", "en"]`. A shop that wants
  // Danish as its BASE language swaps the two halves.
  pages: [
    {
      slug: "om-os",
      showInNav: true,
      title: "About Northbound",
      body: `## Our story

Northbound Coffee Roasters is a demo shop built on Cartwright. We roast beans from direct-trade partners in Ethiopia, Colombia and Sumatra, so every bag reaches you within 48 hours of roasting.

## Sourcing

We buy straight from producers we have visited — never through brokers. Traceability, fair prices, and quality over volume.

## The roastery

Our roastery is in Copenhagen, and we roast in small batches on a Probat L12 so each origin gets its own profile. Filter coffees get a light-medium roast that keeps the acidity; espresso blends go a little darker for body.`,
      translations: {
        da: {
          title: "Om Northbound",
          body: `## Vores historie

Northbound Coffee Roasters er en demo-shop bygget på Cartwright. Vi rister bønner fra direct-trade-partnere i Etiopien, Colombia og Sumatra, så hver pose når dig inden for 48 timer fra rist.

## Sourcing

Vi køber direkte fra producenter vi har besøgt — ikke gennem brokers. Sporbarhed, fair priser og kvalitet over volumen.

## Risteri

Vores risteri ligger i København, og vi rister i små batches på en Probat L12 så hver origin får sin egen profil. Filterbønner får en let-medium ristning der bevarer syren; espresso-blends ristes lidt mørkere for body.`,
        },
      },
    },
    {
      slug: "faq",
      showInNav: true,
      title: "Frequently asked questions",
      body: `## How fresh is the coffee?

We roast to order. Orders ship within 48 hours of roasting, and we recommend brewing within four weeks.

## How should I store the beans?

Airtight container, room temperature, out of direct sunlight. Only freeze beans if you cannot get through them within a month.

## Do you offer subscriptions?

Yes — get in touch and we will set up a delivery plan based on how much coffee you drink.

## Where do the beans come from?

We source single origins from Ethiopia (Yirgacheffe), Colombia (Huila/Nariño) and Sumatra (Mandheling). Our espresso blend combines two or three origins for body and sweetness.`,
      translations: {
        da: {
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
      },
    },
    {
      slug: "shipping",
      title: "Shipping and delivery",
      body: `## Shipping rates

Standard shipping within Denmark costs ${shippingAmount(brand.policies.shippingDefaultDkk, SOURCE_LOCALE)} and is delivered by GLS in 1-2 business days.

Free shipping on every order above ${shippingAmount(brand.policies.shippingFreeThresholdDkk, SOURCE_LOCALE)} (all summer).

## Roasting schedule

We roast on Tuesdays and Fridays. Orders placed before 10:00 are roasted the same day and shipped the next.

## International delivery

We ship across the EU. Shipping is calculated at checkout from weight and destination.

## Tracking

You receive a tracking number by email as soon as GLS picks up the parcel.`,
      translations: {
        da: {
          title: "Fragt og levering",
          body: `## Fragtpriser

Standard-fragt i Danmark koster ${shippingAmount(brand.policies.shippingDefaultDkk, "da")} og leveres med GLS 1-2 hverdage.

Fri fragt på alle ordrer over ${shippingAmount(brand.policies.shippingFreeThresholdDkk, "da")} (gælder hele sommeren).

## Risteplan

Vi rister tirsdag og fredag. Bestillinger placeret før kl. 10 ristes samme dag og sendes dagen efter.

## International levering

Vi sender til hele EU. Fragt beregnes ved checkout baseret på vægt og destination.

## Sporing

Du modtager et tracking-nummer på email så snart pakken er afhentet af GLS.`,
        },
      },
    },
    {
      slug: "returns",
      title: "Returns and exchanges",
      body: `## 30-day right of return

Unopened bags can be returned within 30 days of delivery — we refund the full purchase, shipping included.

## Opened bags

Taste is subjective. If you are unhappy with an opened bag, write to support@northbound.demo and tell us what you tasted. We will either send a different origin or refund the amount.

## How to return

1. Email support@northbound.demo with your order number
2. We send you a return label
3. Pack the bag securely and drop it off at GLS
4. We refund on receipt`,
      translations: {
        da: {
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
      },
    },
    {
      slug: "terms",
      title: "Terms and conditions",
      body: `## Ordering

When you place an order you enter a purchase agreement on the prices and terms shown. Prices include 25% Danish VAT.

## Payment

We accept payment through Stripe (Visa, Mastercard, MobilePay). The amount is captured when the order is roasted and shipped.

## Delivery

We ship with GLS. Risk for the goods passes to you on delivery.

## Complaints

The 24-month statutory warranty covers defective packaging or incorrectly delivered contents. Taste falls outside the statutory warranty but is covered by our return policy.

## Personal data

We store only the information you give us when ordering. See our privacy policy.

## Cartwright demo

This is a demonstration of the Cartwright engine. Northbound Coffee Roasters is not a real shop; payments run in Stripe test mode with card 4242 4242 4242 4242.`,
      translations: {
        da: {
          title: "Handelsbetingelser",
          body: `## Bestilling

Når du afgiver en ordre, indgår vi en købsaftale på de viste priser og vilkår. Priser er inklusive 25% moms.

## Betaling

Vi modtager betaling via Stripe (Visa, Mastercard, MobilePay). Beløbet trækkes når ordren ristes og sendes.

## Levering

Vi sender med GLS. Risikoen for varen overgår til dig ved levering.

## Reklamation

24 måneders købelovsgaranti gælder for defekt emballage eller forkert leveret indhold. Smagsoplevelse falder uden for købeloven men dækkes af vores returpolitik.

## Persondata

Vi opbevarer kun de oplysninger du selv giver os ved bestilling. Se vores privatlivspolitik.

## Cartwright-demo

Dette er en demonstration af Cartwright-engineen. Northbound Coffee Roasters er ikke en rigtig butik; betalingerne kører i Stripe test-mode med kortet 4242 4242 4242 4242.`,
        },
      },
    },
    {
      slug: "privacy",
      title: "Privacy policy",
      body: `## What data we collect

We collect only what you give us: name, delivery address, email and phone number when you order. We never store payment cards — Stripe handles those.

## Why

So we can ship your coffee and contact you if something is wrong with the order. If you signed up for the newsletter, we use your email for that too.

## Cookies

We use strictly necessary cookies (login, cart, security) and — only if you accept them — analytics cookies (Google Analytics 4) that help us understand how the site is used.

## Your rights (GDPR)

You have the right to access, correct and delete your data. Write to admin@northbound.demo and we will handle it within 30 days.

## Demo disclaimer

This is a Cartwright demo. You are not entering real payment details here; orders are deleted nightly along with the rest of the demo data.`,
      translations: {
        da: {
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
      },
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
      // The crema vocabulary (designs/crema/webshop/attributes.ts): roast 1–4,
      // origin, process, notes[], weightG — feeds the pack's data-driven roast
      // dots, origin badges and per-kg unit pricing from first seed.
      //
      // `strength` is what the brew calculator's WebMCP tool searches for.
      // It used to search the strength's NAME against the prose, which made
      // "strong" a dead option on a fresh shop: the espresso blend is the
      // strong one (roast 4) but its copy says "chocolatey body", not
      // "strong". Prose is how a roaster writes; this is how the shop
      // answers a question about it. `productHaystack` reads attribute values,
      // so it is searchable the moment it is seeded.
      //
      // Named `strength`, not `brewStrength`, because the PDP renders every
      // string attribute as a visible spec row with the raw key capitalised —
      // beside "Origin" and "Process", a camelCase key would have shown
      // shoppers "BrewStrength". It also goes out in the Google Merchant feed
      // as a product_detail, which is right for a coffee and reads correctly
      // under this name.
      attributes: {
        origin: "Ethiopia",
        strength: "bright",
        process: "Washed",
        roast: 2,
        notes: ["bergamot", "jasmine", "lemon"],
        weightG: 250,
      },
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
      attributes: {
        origin: "Colombia",
        strength: "balanced",
        process: "Washed",
        roast: 3,
        notes: ["caramel", "chocolate"],
        weightG: 250,
      },
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
      attributes: {
        origin: "Ethiopia & Brazil",
        strength: "strong",
        process: "Blend",
        roast: 4,
        notes: ["chocolate", "stone fruit"],
        weightG: 250,
      },
      categorySlug: "espresso",
      featured: true,
    },
  ],
};
