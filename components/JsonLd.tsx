/**
 * Renderer Schema.org JSON-LD som <script type="application/ld+json">.
 *
 * Bruges i Server Components til at injicere structured data som Google og
 * AI-agenter læser (Product, Organization, BreadcrumbList, FAQPage osv.).
 *
 * SIKKERHED: data kan indeholde bruger-/admin-skrevne felter (produktnavne,
 * beskrivelser, kategorinavne m.m.). JSON.stringify escaper IKKE "<", ">"
 * eller "&" — en værdi med "</script>" ville ellers bryde ud af <script>-
 * blokken og tillade script-injection. Vi escaper derfor de tegn til deres
 * \uXXXX-form: det parser stadig som korrekt JSON-LD, men kan ikke lukke
 * tag'et eller starte et nyt.
 */
type JsonLdProps = {
  /** Schema.org-objekt der bliver serialized til <script>-content. */
  data: Record<string, unknown> | Array<Record<string, unknown>>;
};

export default function JsonLd({ data }: JsonLdProps) {
  const json = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
