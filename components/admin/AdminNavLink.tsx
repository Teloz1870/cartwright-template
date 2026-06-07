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
 * Phase 8 Task C (Gemini-review fix): active-state på admin sidebar/mobile-nav.
 *
 * Active-logikken er nu delt via isRouteActive() i lib/admin/nav.ts (samme
 * regel bruges til at auto-folde den gruppe der rummer den aktive rute).
 */
export default function AdminNavLink({ href, label, mobile, icon: Icon }: Props) {
  const pathname = usePathname();
  const isActive = isRouteActive(pathname, href);

  const baseLayout = mobile ? "shrink-0" : "";
  const stateClasses = isActive
    ? "bg-white/15 text-white"
    : "text-white/85 hover:bg-white/10 hover:text-white";

  return (
    <Link
      href={href}
      className={`${baseLayout} inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition ${stateClasses}`}
      aria-current={isActive ? "page" : undefined}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden /> : null}
      <span>{label}</span>
    </Link>
  );
}
