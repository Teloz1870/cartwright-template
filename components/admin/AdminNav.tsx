"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";

import AdminNavLink from "@/components/admin/AdminNavLink";
import {
  NAV_GROUPS,
  PINNED_ICONS,
  filterNav,
  filterPinned,
  isRouteActive,
  type NavContext,
  type NavGroup,
} from "@/lib/admin/nav";

type Props = NavContext & {
  /** "sidebar" = grupperet desktop-nav; "mobile" = fladtet horisontal bar. */
  variant?: "sidebar" | "mobile";
};

const STORAGE_PREFIX = "cartwright:admin-nav:";

/**
 * localStorage is an external store. We read it via useSyncExternalStore instead
 * of a setState-in-effect — that avoids "cascading renders"
 * (react-hooks/set-state-in-effect) AND hydration mismatch: the server snapshot is
 * `null`, so SSR + the first client render match, after which React re-renders
 * with the stored preference without a manual effect.
 */
const navStoreListeners = new Set<() => void>();

function subscribeNavStore(cb: () => void) {
  navStoreListeners.add(cb);
  return () => {
    navStoreListeners.delete(cb);
  };
}

function readStoredOpen(key: string): boolean | null {
  try {
    const v = localStorage.getItem(key);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    /* storage unavailable (private mode) — no preference */
  }
  return null;
}

function writeStoredOpen(key: string, open: boolean) {
  try {
    localStorage.setItem(key, open ? "1" : "0");
  } catch {
    /* storage unavailable — ignore persistence */
  }
  for (const cb of navStoreListeners) cb();
}

export default function AdminNav({ variant = "sidebar", ...ctx }: Props) {
  const pinned = filterPinned(ctx);
  const groups = filterNav(NAV_GROUPS, ctx);

  // Mobile (Phase 1): keep the horizontal scroll bar — flat across pinned +
  // every visible group item, so the grouping does not break narrow screens.
  if (variant === "mobile") {
    const flat = [...pinned, ...groups.flatMap((g) => g.items)];
    return (
      <nav className="-mx-1 flex gap-1 overflow-x-auto">
        {flat.map((link) => (
          <AdminNavLink key={link.href} href={link.href} label={link.label} mobile />
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
      {pinned.map((link) => (
        <AdminNavLink
          key={link.href}
          href={link.href}
          label={link.label}
          icon={PINNED_ICONS[link.href]}
        />
      ))}

      <div className="mt-3 flex flex-col gap-1">
        {groups.map((group) => (
          <NavGroupDisclosure key={group.id} group={group} />
        ))}
      </div>
    </nav>
  );
}

function NavGroupDisclosure({ group }: { group: NavGroup }) {
  const pathname = usePathname();
  const hasActive = group.items.some((item) => isRouteActive(pathname, item.href));
  const storageKey = `${STORAGE_PREFIX}${group.id}`;

  const storedPref = useSyncExternalStore(
    subscribeNavStore,
    () => readStoredOpen(storageKey), // client snapshot
    () => null, // server snapshot — no preference known at SSR time
  );

  // The active route always wins (you never see a collapsed group containing your
  // current page); otherwise the user's stored choice; otherwise the group default.
  const open = hasActive ? true : storedPref ?? !group.collapsedByDefault;

  const Icon = group.icon;

  return (
    <details
      open={open}
      onToggle={(event) => writeStoredOpen(storageKey, event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide text-sol-muted transition hover:bg-[color:var(--admin-nav-active-bg)] hover:text-sol-ink [&::-webkit-details-marker]:hidden">
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1">{group.title}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </summary>
      <div className="mt-1 flex flex-col gap-1 pl-2">
        {group.items.map((item) => (
          <AdminNavLink key={item.href} href={item.href} label={item.label} />
        ))}
      </div>
    </details>
  );
}
