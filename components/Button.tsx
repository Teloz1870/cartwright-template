import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "dark" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-sol-accent text-white hover:brightness-95",
  dark: "bg-sol-ink text-white hover:brightness-125",
  ghost: "bg-transparent text-sol-ink border border-sol-ink hover:bg-sol-ink hover:text-white",
};

const BASE =
  "inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-bold tracking-wide transition disabled:opacity-50 disabled:cursor-not-allowed";

type ButtonAsButton = { href?: undefined } & ComponentProps<"button"> & {
  variant?: Variant;
  children: ReactNode;
};
type ButtonAsLink = { href: string } & {
  variant?: Variant;
  children: ReactNode;
  className?: string;
};

export function Button(props: ButtonAsButton | ButtonAsLink) {
  const { variant = "primary", className = "", children } = props;
  const classes = `${BASE} ${VARIANTS[variant]} ${className}`;
  if ("href" in props && props.href) {
    return (
      <Link href={props.href} className={classes}>
        {children}
      </Link>
    );
  }
  const rest = { ...props } as Record<string, unknown>;
  delete rest.variant;
  delete rest.className;
  delete rest.children;
  delete rest.href;

  return (
    <button className={classes} {...(rest as ComponentProps<"button">)}>
      {children}
    </button>
  );
}
