"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { isRouteActive } from "@/lib/admin/nav";

type Props = {
  href: string;
  label: string;
  /** When true, render the mobile-row variant (shrink-0 + horizontal). */
  mobile?: boolean;
  /** Optional leading icon (used for pinned top items). */
  icon?: LucideIcon;
};

/**
 * Phase 8 Task C (Gemini review fix): active state on the admin sidebar/mobile nav.
 *
 * The active logic is now shared via isRouteActive() in lib/admin/nav.ts (the same
 * rule is used to auto-expand the group containing the active route).
 */
export default function AdminNavLink({ href, label, mobile, icon: Icon }: Props) {
  const pathname = usePathname();
  const isActive = isRouteActive(pathname, href);

  const baseLayout = mobile ? "shrink-0" : "";
  const stateClasses = isActive
    ? "bg-[color:var(--admin-nav-active-bg)] font-semibold text-sol-accent"
    : "text-sol-ink/80 hover:bg-[color:var(--admin-nav-active-bg)] hover:text-sol-ink";

  return (
    <Link
      href={href}
      className={`${baseLayout} inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${stateClasses}`}
      aria-current={isActive ? "page" : undefined}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden /> : null}
      <span>{label}</span>
    </Link>
  );
}
