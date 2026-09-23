"use client";

import { Link, usePathname } from "@/i18n/routing";
import type { ReactNode } from "react";

type NavLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
};

export default function NavLink({ href, children, className }: NavLinkProps) {
  const pathname = usePathname();
  const isActive =
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      className={[
        "whitespace-nowrap border-b-2 py-1 text-sm font-medium transition-colors hover:text-sol-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sol-accent",
        isActive
          ? "border-sol-accent text-sol-accent"
          : "border-transparent text-sol-ink",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-current={isActive ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
