/**
 * Studio button-system — 4 variants × 3 sizes. Port af cartwright-app's
 * Button + ButtonLink, samlet i én fil for at minimere ny-fil-overhead.
 * Bruger cw-* tokens fra themes/studio.css.
 */
import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cw-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-cw-paper dark:focus-visible:ring-offset-cw-ink disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-cw-stone-900 text-cw-stone-50 hover:bg-cw-stone-700 dark:bg-cw-stone-50 dark:text-cw-stone-900 dark:hover:bg-cw-stone-200",
  secondary:
    "bg-cw-terracotta text-cw-ink hover:bg-cw-terracotta-strong hover:text-white",
  outline:
    "border border-cw-stone-300 dark:border-cw-stone-700 text-cw-stone-900 dark:text-cw-stone-50 hover:bg-cw-stone-100 dark:hover:bg-cw-stone-800",
  ghost:
    "text-cw-stone-700 dark:text-cw-stone-300 hover:bg-cw-stone-100 dark:hover:bg-cw-stone-800",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

export function StudioButton({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: CommonProps & ComponentPropsWithoutRef<"button">) {
  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function StudioButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  href,
  ...rest
}: CommonProps & ComponentPropsWithoutRef<typeof Link>) {
  return (
    <Link
      href={href}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {children}
    </Link>
  );
}
