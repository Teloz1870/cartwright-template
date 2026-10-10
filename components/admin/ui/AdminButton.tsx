import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AdminButton — a Polaris-style button for the admin backend. Centralises the two
 * inline button strings that were spread across ~58 pages (primary navy fill +
 * secondary border). The accent stays Cartwright navy (bg-sol-accent).
 *
 * Server-component friendly (no "use client"): renders as <Link> if `href`
 * is set, otherwise <button>. onChange/onClick can only be passed by client callers.
 */
type Variant = "primary" | "secondary" | "plain" | "destructive";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-sol-accent text-white hover:brightness-95",
  secondary:
    "bg-sol-sand text-sol-ink border border-sol-glass-border-dark hover:border-sol-accent hover:text-sol-accent",
  plain: "bg-transparent text-sol-accent hover:bg-sol-accent/10",
  destructive:
    "bg-transparent text-red-600 border border-red-300 hover:bg-red-50 hover:border-red-400",
};

const SIZES: Record<Size, string> = {
  sm: "px-2.5 py-1.5 text-xs gap-1",
  md: "px-3.5 py-2 text-sm gap-1.5",
};

const BASE =
  "inline-flex items-center justify-center rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";

type Common = {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
  className?: string;
  children: ReactNode;
};

type AsButton = Common & { href?: undefined } & Omit<ComponentProps<"button">, keyof Common>;
type AsLink = Common & { href: string } & Omit<ComponentProps<typeof Link>, keyof Common | "href">;

export default function AdminButton(props: AsButton | AsLink) {
  const {
    variant = "primary",
    size = "md",
    icon: Icon,
    loading = false,
    className,
    children,
    ...rest
  } = props;

  const classes = cn(BASE, SIZES[size], VARIANTS[variant], className);
  const inner = (
    <>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : Icon ? (
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
      ) : null}
      <span>{children}</span>
    </>
  );

  if ("href" in rest && rest.href) {
    return (
      <Link className={classes} {...(rest as ComponentProps<typeof Link>)}>
        {inner}
      </Link>
    );
  }

  const btnRest = rest as ComponentProps<"button">;
  return (
    <button className={classes} {...btnRest} disabled={loading || btnRest.disabled}>
      {inner}
    </button>
  );
}
