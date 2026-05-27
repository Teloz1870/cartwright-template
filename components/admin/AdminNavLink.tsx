"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  href: string;
  label: string;
  /** When true, render the mobile-row variant (shrink-0 + horizontal). */
  mobile?: boolean;
};

/**
 * Phase 8 Task C (Gemini-review fix): active-state på admin sidebar/mobile-nav.
 *
 * Active hvis exact match eller hvis pathname starter med href (gælder for
 * sub-routes som /admin/produkter/[id]). Dashboard ("/admin") matcher kun
 * exact for at undgå at den lyser hele tiden.
 */
export default function AdminNavLink({ href, label, mobile }: Props) {
  const pathname = usePathname();
  const isActive =
    pathname === href || (href !== "/admin" && pathname?.startsWith(`${href}/`));

  const baseLayout = mobile ? "shrink-0" : "";
  const stateClasses = isActive
    ? "bg-white/15 text-white"
    : "text-white/85 hover:bg-white/10 hover:text-white";

  return (
    <Link
      href={href}
      className={`${baseLayout} rounded-lg px-3 py-2 text-sm font-bold transition ${stateClasses}`}
      aria-current={isActive ? "page" : undefined}
    >
      {label}
    </Link>
  );
}
