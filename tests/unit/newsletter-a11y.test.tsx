import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import NewsletterSignup from "@/components/NewsletterSignup";

/**
 * Forms-a11y regression: the footer newsletter form must wire its input to a
 * status region so screen readers can announce validation errors / success
 * (WCAG 4.1.3 Status Messages, 3.3.1 Error Identification). These attributes
 * are visually inert — the at-rest render stays byte-identical — so this guards
 * against silent removal during refactors.
 */
describe("NewsletterSignup a11y wiring", () => {
  const html = renderToStaticMarkup(<NewsletterSignup />);

  it("input is described by the status region", () => {
    expect(html).toContain('aria-describedby="newsletter-status"');
  });

  it("input exposes a (valid-at-rest) validity state", () => {
    expect(html).toContain('aria-invalid="false"');
  });

  it("keeps its accessible name", () => {
    expect(html).toContain('aria-label="Email address"');
  });
});
