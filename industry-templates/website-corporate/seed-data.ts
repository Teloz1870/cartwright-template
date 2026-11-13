import type { IndustryTemplate } from "../types";

/**
 * Phase 4 close-out: corporate / holding-site template.
 *
 * For shops in mode="website" with ecommerceEnabled=false. Teloz uses this
 * (under the legacy alias "saas" — both slugs point at this template via
 * index.ts so Teloz' existing BrandingSettings.industryTemplate = "saas"
 * keeps working without a DB migration).
 *
 * No shop catalogue. Four static pages: about, services, contact, privacy. Forks
 * customise via /admin/sider.
 */
export const websiteCorporateTemplate: IndustryTemplate = {
  label: "Corporate / Holding Site",
  description:
    "Marketing site for a holding company, agency, or service business. No shop catalogue — just info pages and contact.",
  categories: [],
  pages: [
    {
      slug: "about",
      showInNav: true,
      title: "About",
      body: `## Who we are

We are an independent organisation focused on clear advice, dependable delivery and long-term working relationships. This page is the public starting point for understanding the company behind the website: what visitors can expect, how decisions are made and where to ask for accountable help.

## What we do

Our work begins with the outcome a customer or partner needs. We define the scope, explain the important trade-offs and agree on responsibilities before delivery starts. Services, timelines and commercial terms should be confirmed in writing, and material changes should be discussed rather than hidden behind vague language.

## How we work

Public information is available to people, search engines and read-only AI agents. Customer information, internal records and operational actions stay protected by authentication and explicit permissions. We review published information as the business changes and make policies and contact routes easy to find.

## People and accountability

The legal company name, address and support details configured for this site identify the organisation responsible for its content and services. Before launch, the owner should add its real history, leadership, professional credentials and examples of completed work so visitors can verify the claims that matter to them.`,
    },
    {
      slug: "services",
      showInNav: true,
      title: "Services",
      body: `## Services

Describe what your company offers. Add as many service blocks as you need.

### Service one

Short description.

### Service two

Short description.

### Service three

Short description.`,
    },
    {
      slug: "contact",
      showInNav: true,
      title: "Contact",
      body: `## Get in touch

Use the public email address, telephone number and postal address configured for this site. The company details in the footer identify who is responsible for the website. Published opening hours indicate when the team normally responds, although complex enquiries may require additional investigation.

## What to include

Tell us what you need, the service or page your question concerns and the best safe way to reply. If the enquiry relates to an existing engagement, include a reference that helps us locate it. Never send passwords, complete payment-card details, private API keys or unnecessary personal information.

## Support, privacy and accessibility

General questions, service enquiries and accessibility feedback use the same public contact route. Privacy and data-rights requests are passed to the organisation responsible for this site and handled under the published privacy policy. If an issue involves a third-party payment, hosting or delivery provider, we will explain which provider is involved and what the next step is.

## Before launch

The site owner should confirm its real response times, escalation path, company registration details and physical address in the administration area and brand configuration.`,
    },
    {
      slug: "privacy",
      title: "Privacy Policy",
      body: `## Who is responsible

The legal organisation and public privacy contact configured for this site are responsible for the personal information described here. The company name, postal address and support email are published on the About and Contact routes so a visitor can identify and reach the data controller.

## Information we process

We process information that a person deliberately submits through an enquiry, account or service relationship, together with limited technical information needed to deliver, secure and diagnose the website. The exact fields depend on the enabled features. Payment providers, if enabled, process payment credentials under their own secure systems; this site should not request complete card details through ordinary messages.

## Purposes and legal bases

Information is used to answer enquiries, deliver agreed services, maintain security, meet legal obligations and keep necessary business records. Consent is requested where local law requires it, including for optional analytics or marketing. Personal information is not sold, and access is limited to people and processors that need it for a documented purpose.

## Processors, retention and international transfers

Necessary hosting, database, email, analytics and payment providers may process information under contractual safeguards. Records are retained only for as long as their purpose or applicable law requires. The site owner must document its actual providers, retention periods and any international-transfer safeguards before launch.

## Your choices and rights

Depending on the applicable law, a person may request access, correction, deletion, restriction, objection or portability and may withdraw consent or complain to a data-protection authority. Requests can be sent through the published contact route. Identity may be verified before private information is disclosed or changed.

## Keeping this notice accurate

This is a substantive starter policy, not legal advice. The site owner must review it against the organisation's real services, vendors, jurisdictions and retention practices and update it whenever those facts change.`,
    },
  ],
  products: [],
};
