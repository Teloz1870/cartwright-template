import { Suspense, isValidElement } from "react";

/**
 * Renders the body of a storefront page that decides its HTTP status first.
 *
 * The PDP and the category page run their redirect + lookup in the default
 * export and only then return `<Suspense fallback={skeleton}><Detail …/>
 * </Suspense>` (SOFT-404-PDP-PLP): a `notFound()` behind a boundary is already
 * a streamed 200. A unit test that wants the page's tree therefore takes two
 * steps — the export, then the detail component it hands the boundary — and
 * this helper is those two steps. Any other shape throws, so a test can never
 * quietly inspect the wrapper and pass on an empty tree.
 */
export async function renderPageBody(page: Promise<unknown>): Promise<unknown> {
  const node = await page;
  if (!isValidElement(node) || node.type !== Suspense) {
    throw new Error("expected the page to return its <Suspense> boundary after the lookup");
  }
  const detail = (node.props as { children?: unknown }).children;
  if (!isValidElement(detail) || typeof detail.type !== "function") {
    throw new Error("expected exactly one component inside the page's <Suspense>");
  }
  return (detail.type as (props: unknown) => unknown)(detail.props);
}
