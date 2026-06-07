import type { IndustryTemplate } from "../types";

/**
 * Phase 4 close-out: corporate / holding-site template.
 *
 * For shops in mode="website" with ecommerceEnabled=false. Teloz uses this
 * (under the legacy alias "saas" — both slugs point at this template via
 * index.ts so Teloz' existing BrandingSettings.industryTemplate = "saas"
 * keeps working without a DB migration).
 *
 * No shop catalogue. Three static pages: about, services, contact. Forks
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
      title: "About",
      body: `## About us

Replace this with your company story.

## What we do

Edit in /admin/sider to describe your services or products.

## Our team

Add team bios, photos, and contact info.`,
    },
    {
      slug: "services",
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
      title: "Contact",
      body: `## Get in touch

Email us at the address in brand.config.ts. Replace this copy in /admin/sider with your real contact info, opening hours, and address.`,
    },
  ],
  products: [],
};
