# PII-inventar & GDPR-governance

Kilden er `lib/gdpr/pii-map.ts` (maskin-læsbar). Dette er menneske-versionen +
governance-kontekst. Gennemgået mod `prisma/schema.prisma` 2026-05-30.

## Hvor kunde-PII lever

| Model | Subjekt-link | PII-felter | Ved erasure |
|---|---|---|---|
| **User** | `userId` | email, name, phoneNumber, shipping*, passwordHash | anonymisér (behold række — FKs) |
| **Order** | `userId` | email, shippingName/Address/Zip/City, phoneNumber | anonymisér PII, **behold beløb + stripePaymentIntentId** (bogføringspligt) |
| **ProductReview** | `userId` | authorName, authorEmail | anonymisér forfatter, behold rating/body |
| **Subscription** | `userId` | stripeCustomerId | behold (afmeld separat hos Stripe) |
| **Lead** | email | name, email, phone, company, message | slet hele rækken |
| **AcpCheckoutSession** | email | buyerEmail/Name/Phone, shipping* | slet hele rækken |
| **AuditLog** | actor `user:<id>` | ip (argsJson redactes ved skrivning) | nul ip |

Strategier: `null` (nullable), `redact` → `[slettet]`, `hash` (salted email-hash,
bevarer unikhed/linkage uden PII), `keep` (finansielt/lovligt).

## Lovligt grundlag for at BEHOLDE efter erasure

- **Ordrebeløb + betalingsreferencer**: bogføringsloven (5 års opbevaring). Derfor
  anonymiseres modtager-PII på ordrer, men selve transaktionen beholdes.
- **AuditLog**: dokumentation/ansvarlighed (art. 5(2)). `argsJson` redactes
  allerede ved skrivning (`lib/audit.ts:redactSensitive`).

## Data-subject-rettigheder (denne branch)

- **Eksport (art. 15/20)** — `/api/account/export` (selvbetjening) + admin-export.
  Samler User + Orders + Reviews + Leads + Subscription + Cart som JSON. (B1)
- **Sletteret (art. 17)** — admin-action `anonymizeCustomer(userId)`: soft, typed,
  audited. Sletter aldrig automatisk; admin udløser per request. (B2)

## Retention

- `brand.policies.retentionMonths` (default `null` = ingen auto-retention).
- `brand.policies.auditRetentionDays` (default `null` = behold for evigt).
- Cleanup-cron sletter kun ALLEREDE udløbne tokens/sessions (B3) — aldrig aktive.

## Processor-register (art. 28)

`brand.policies.processors` (vist read-only på `/admin/processors`, B4). 8
processors registreret med formål + delt data + DPA-status. Fork-shops tilpasser.

## Kendte begrænsninger

- Eksternt data (Stripe customer, OAuth-tokens hos provider) skal slettes hos den
  enkelte processor — erasure her fjerner kun de lokale referencer/PII.
- `hash`-strategien for email bruger en salt fra env (`AUTH_SECRET`); samme input
  → samme hash, så historik kan stadig de-dupes uden at afsløre adressen.
