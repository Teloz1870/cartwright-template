"use client";

import NextLink, { type LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { wrapNavigation } from "@/app/lib/view-transitions";

type Props = Omit<LinkProps, "children"> &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    children?: ReactNode;
  };

/**
 * Drop-in replacement for `next/link` that wraps SPA navigation in
 * `document.startViewTransition` when `brand.features.viewTransitions` is
 * on AND the browser supports it. Otherwise it behaves identically to
 * Next.js's `Link` — same prefetch, same accessibility, same SSR.
 *
 * Skipped intentionally:
 *   - middle-click / ctrl/meta-click (user wants new tab)
 *   - external `href` (not a string — `<UrlObject>` not supported here)
 *   - default-prevented clicks (caller cancelled)
 *
 * The fall-through path delegates back to NextLink, which handles
 * prefetch and the actual navigation. The view-transition wrapper only
 * intervenes when we can do the full SPA navigation.
 */
export function TransitionLink({
  children,
  onClick,
  ...props
}: Props) {
  const router = useRouter();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (onClick) onClick(e);
    if (e.defaultPrevented) return;
    if (
      e.button !== 0 ||
      e.ctrlKey ||
      e.metaKey ||
      e.shiftKey ||
      e.altKey
    ) {
      return; // let the browser open in new tab / window / save link
    }

    // Only intercept string hrefs — UrlObject support would require us to
    // reimplement Next.js's URL serialisation, not worth the complexity.
    const href = props.href;
    if (typeof href !== "string") return;

    e.preventDefault();
    wrapNavigation(() => router.push(href));
  }

  return (
    <NextLink {...props} onClick={handleClick}>
      {children}
    </NextLink>
  );
}
