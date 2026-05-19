import type { IndustryTemplate } from "../types";

/**
 * ULTRAPLAN-lite UL4: generic Demo Shop fallback-template.
 *
 * Bruges når brand.industryTemplate ikke matcher en kendt template, eller
 * når en frisk fork vil have minimal placeholder-content frem for solbrille-
 * eller hegn-data. Indeholder 2 kategorier + 6 produkter + 4 standard-pages.
 *
 * Forkers første skridt: kør seed → få Demo Shop → erstat med rigtigt indhold
 * via /admin (eller skift industryTemplate til noget passende).
 */
export const genericTemplate: IndustryTemplate = {
  label: "Demo shop",
  description: "Minimal placeholder med 6 demo-produkter — fork-shops fylder selv på.",
  categories: [
    {
      name: "Produkter",
      slug: "produkter",
      description: "Vores hovedkategori — udskift med dine egne kategorier i admin.",
    },
    {
      name: "Tilbehør",
      slug: "tilbehor",
      description: "Tilbehør og ekstra-varer.",
    },
  ],
  pages: [
    {
      slug: "om-os",
      title: "Om os",
      body: `## Velkommen

Dette er en demo-side. Rediger indholdet via /admin/sider for at fortælle din egen historie.

## Vores værdier

- Kvalitet i materialer og udførelse
- Fair pris i forhold til værdien
- God kundeservice

Skift teksten her ud med det der passer til dit brand.`,
    },
    {
      slug: "kontakt",
      title: "Kontakt",
      body: `## Skriv til os

Kontakt os på den e-mail-adresse du har sat i brand.config.ts.

## Find os

Tilføj din virksomheds-adresse her.

## Åbningstider

Tilføj dine åbningstider her.`,
    },
    {
      slug: "faq",
      title: "Ofte stillede spørgsmål",
      body: `## Hvor lang returret har jeg?

Standard returret er 30 dage. Tilpas via brand.config.policies.returnDays.

## Hvad koster fragt?

Tilpas via brand.config.policies.shippingDefaultDkk og shippingFreeThresholdDkk.

## Kan I hjælpe mig med at vælge?

Ja, kontakt os eller brug AI-assistenten på siden.`,
    },
    {
      slug: "handelsbetingelser",
      title: "Handelsbetingelser",
      body: `## Virksomhedsoplysninger

TODO: Udfyld med dit CVR, adresse, kontakt-info.

## Priser og betaling

Alle priser er i DKK inkl. moms (eller tilpas til din valuta).

## Levering

Standardlevering 1-3 hverdage.

## Fortrydelsesret

14 dages lovbestemt fortrydelsesret.

## Reklamation

2 års reklamationsret efter købeloven.`,
    },
  ],
  products: [
    {
      name: "Produkt Alpha",
      slug: "produkt-alpha",
      description: "Eksempel-produkt nummer ét. Beskrivelsen er placeholder — erstat med dit eget indhold.",
      priceDkk: 29900,
      images: ["https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800"],
      stock: 10,
      categorySlug: "produkter",
      featured: true,
    },
    {
      name: "Produkt Beta",
      slug: "produkt-beta",
      description: "Eksempel-produkt nummer to. Tilpas billede, pris og beskrivelse via /admin/produkter.",
      priceDkk: 39900,
      images: ["https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800"],
      stock: 15,
      categorySlug: "produkter",
      featured: true,
    },
    {
      name: "Produkt Gamma",
      slug: "produkt-gamma",
      description: "Tredje demo-produkt. Vist på forsiden som featured-produkt.",
      priceDkk: 49900,
      images: ["https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800"],
      stock: 8,
      categorySlug: "produkter",
      featured: true,
    },
    {
      name: "Produkt Delta",
      slug: "produkt-delta",
      description: "Fjerde demo-produkt — feature-rige produkt-side med variant-picker og AI-assistent.",
      priceDkk: 59900,
      images: ["https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800"],
      stock: 12,
      categorySlug: "produkter",
      featured: true,
    },
    {
      name: "Tilbehør Lite",
      slug: "tilbehor-lite",
      description: "Tilbehørs-produkt for at demonstrere multi-kategori-flow.",
      priceDkk: 9900,
      images: ["https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=800"],
      stock: 50,
      categorySlug: "tilbehor",
      featured: false,
    },
    {
      name: "Tilbehør Pro",
      slug: "tilbehor-pro",
      description: "Andet tilbehør i kataloget.",
      priceDkk: 14900,
      images: ["https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=800"],
      stock: 30,
      categorySlug: "tilbehor",
      featured: false,
    },
  ],
};
