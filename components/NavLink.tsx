"use client";

import NextLink from "next/link";
import { usePathname as useBrowserPathname } from "next/navigation";
import { Link, usePathname } from "@/i18n/routing";
import { brand } from "@/brand.config";
import type { ReactNode } from "react";

type NavLinkProps = {
  href: string;
  /**
   * URL5-a2 — an address that already carries its locale (a stored permalink
   * from `categoryHref`). next-intl's <Link> would prefix it again (/da/da/…),
   * so it is rendered through next/link as it is, and matched against the
   * browser's own path.
   */
  prefixedHref?: string;
  children: ReactNode;
  className?: string;
};

/** The path alone (no query or fragment), without its trailing slash. */
const bare = (path: string) => path.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/";

/** `/` or `/<locale>` — the address every page sits below. */
const isLocaleRoot = (path: string) =>
  path === "/" || (brand.locales as readonly string[]).some((locale) => path === `/${locale}`);

/**
 * Active on the address itself and below it — never everywhere below a locale
 * root. The root is named by the shop's locales, not guessed from the segment
 * count: under `localePrefix: "never"` a permalink `/hegn` is one segment deep
 * and still lights on `/hegn/komposit`.
 */
function isAtOrBelow(browserPath: string, prefixedHref: string): boolean {
  const target = bare(prefixedHref);
  const here = bare(browserPath);
  if (here === target) return true;
  return !isLocaleRoot(target) && here.startsWith(`${target}/`);
}

export default function NavLink({ href, prefixedHref, children, className }: NavLinkProps) {
  const pathname = usePathname();
  const browserPath = useBrowserPathname() ?? "";
  const isActive = prefixedHref
    ? isAtOrBelow(browserPath, prefixedHref)
    : pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  const linkClass = [
    "whitespace-nowrap border-b-2 py-1 text-sm font-medium transition-colors hover:text-sol-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sol-accent",
    isActive ? "border-sol-accent text-sol-accent" : "border-transparent text-sol-ink",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const current = isActive ? "page" : undefined;

  return prefixedHref ? (
    <NextLink href={prefixedHref} className={linkClass} aria-current={current}>
      {children}
    </NextLink>
  ) : (
    <Link href={href} className={linkClass} aria-current={current}>
      {children}
    </Link>
  );
}
