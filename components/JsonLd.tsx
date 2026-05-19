/**
 * Renderer Schema.org JSON-LD som <script type="application/ld+json">.
 *
 * Bruges i Server Components til at injicere structured data der Google
 * og andre søgemaskiner læser for rich-snippets (BreadcrumbList, FAQPage,
 * ProductSchema, OrganizationSchema osv.).
 *
 * dangerouslySetInnerHTML er sikkert her fordi vi serialiserer kontrolleret
 * data via JSON.stringify (escaper Unicode + special-chars korrekt).
 * Pas på at IKKE pase user-input direkte ind uden sanitization.
 */
type JsonLdProps = {
  /** Schema.org-objekt der bliver serialized til <script>-content. */
  data: Record<string, unknown> | Array<Record<string, unknown>>;
};

export default function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data),
      }}
    />
  );
}
