import Link from "next/link";
import PaymentMethodsRow from "@/components/payments/PaymentMethodsRow";
import { brand } from "@/brand.config";

type BadgeVariant = "homepage" | "product" | "checkout" | "footer" | "category";

type Badge = {
  id: string;
  label: string;
  sublabel?: string;
  href?: string;
  icon: React.ReactNode;
  external?: boolean;
  stripe?: boolean;
};

type Props = {
  variant: BadgeVariant;
  className?: string;
};

const textClasses = {
  homepage: "text-sol-ink hover:text-sol-accent",
  product: "text-sol-muted hover:text-sol-ink",
  checkout: "text-sol-muted hover:text-sol-ink",
  footer: "text-white/70 hover:text-white",
  category: "text-sol-ink hover:text-sol-accent",
} satisfies Record<BadgeVariant, string>;

const layoutClasses = {
  homepage: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4",
  product: "grid gap-3 sm:grid-cols-2",
  checkout: "grid gap-3",
  footer: "flex flex-wrap items-center gap-x-5 gap-y-2",
  // Category: altid 3-col så badges fylder 1 row også på mobile (~80px i stedet for ~300px).
  // Reducerer "trust-signal-spilde" og lader produkter komme above-the-fold tidligere.
  category: "grid grid-cols-3 gap-2 sm:gap-4",
} satisfies Record<BadgeVariant, string>;

const visibleByVariant = {
  homepage: ["gratis-fragt", "returret", "primary-feature", "sikker-betaling"],
  product: ["gratis-fragt", "returret"],
  checkout: ["gratis-fragt", "returret", "sikker-betaling"],
  footer: ["gratis-fragt", "returret", "primary-feature", "sikker-betaling", "gdpr"],
  category: ["gratis-fragt", "returret", "primary-feature"],
} satisfies Record<BadgeVariant, string[]>;

/**
 * Linked commerce trust badges for homepage, product, checkout, and footer contexts.
 */
export default async function TrustBadges({ variant, className = "" }: Props) {
  const badges: Badge[] = [
    {
      id: "gratis-fragt",
      label: "Gratis fragt",
      sublabel: "Over 499 kr",
      href: "/info/fragt-og-levering",
      icon: <TruckIcon />,
    },
    {
      id: "returret",
      label: "30 dages returret",
      sublabel: "Nem returnering",
      href: "/info/returret",
      icon: <ReturnIcon />,
    },
    {
      // UL8.5: label fra brand.uiLabels.trustBadgesPrimary så fork-shops
      // kan ændre til "Galvaniseret", "Maskinopvask" etc. uden code-edit.
      id: "primary-feature",
      label: brand.uiLabels.trustBadgesPrimary,
      sublabel: "Alle modeller",
      href: "/info/faq",
      icon: <SunIcon />,
    },
    {
      id: "sikker-betaling",
      label: "Sikker betaling",
      sublabel: "Kort og wallets",
      icon: <CardIcon />,
      stripe: true,
    },
    ...(process.env.NEXT_PUBLIC_EMAERKET === "true"
      ? [
          {
            id: "e-maerket",
            label: "e-mærket",
            href: "https://www.emaerket.dk",
            icon: <ShieldIcon />,
            external: true,
          } satisfies Badge,
        ]
      : []),
    {
      id: "gdpr",
      label: "GDPR",
      href: "/info/privatlivspolitik",
      icon: <LockIcon />,
    },
  ];

  const visible = new Set(visibleByVariant[variant]);
  const renderedBadges = badges.filter(
    (badge) => visible.has(badge.id) || badge.external,
  );

  return (
    <div className={`${layoutClasses[variant]} ${className}`}>
      {renderedBadges.map((badge) => {
        // Category-variant er kompakt på mobile: kun ikon centreret + label.
        // Sublabel + flex-row vises først på sm+ for at spare lodret plads.
        const isCategoryCompact = variant === "category";
        const content = (
          <span
            className={`group transition ${textClasses[variant]} ${
              isCategoryCompact
                ? "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg border border-sol-ink/10 bg-white/60 px-2 py-3 text-center sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:text-left"
                : variant === "homepage" || variant === "checkout"
                  ? "inline-flex min-h-12 items-center gap-3 rounded-lg border border-sol-ink/10 bg-white/60 px-4 py-3"
                  : "inline-flex min-h-12 items-center gap-3"
            }`}
          >
            <span className="text-sol-accent">{badge.icon}</span>
            <span className="min-w-0">
              <span
                className={`block font-black leading-tight ${
                  isCategoryCompact ? "text-xs sm:text-sm" : "text-sm"
                }`}
              >
                {badge.label}
              </span>
              {badge.sublabel && (
                <span
                  className={`block text-xs leading-5 opacity-75 ${
                    isCategoryCompact ? "hidden sm:block" : ""
                  }`}
                >
                  {badge.sublabel}
                </span>
              )}
              {badge.stripe && (
                <PaymentMethodsRow
                  size="small"
                  methods={["stripe-link"]}
                  className="mt-1"
                />
              )}
            </span>
          </span>
        );

        if (!badge.href) {
          return <span key={badge.id}>{content}</span>;
        }

        if (badge.external) {
          return (
            <a
              key={badge.id}
              href={badge.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {content}
            </a>
          );
        }

        return (
          <Link key={badge.id} href={badge.href}>
            {content}
          </Link>
        );
      })}
    </div>
  );
}

function TruckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 13h11l3-4h2v4M2 13v3h2a2 2 0 0 0 4 0h6a2 2 0 0 0 4 0h0v-3" />
    </svg>
  );
}

function ReturnIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 7H3v-4" />
      <path d="M3.5 7.5A7 7 0 1 0 10 3" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="3" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="14" height="10" rx="1.5" />
      <path d="M3 9h14" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2l6 2v5c0 4-2.5 7-6 9c-3.5-2-6-5-6-9V4l6-2Z" />
      <path d="M7.5 10l1.7 1.7l3.5-4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="12" height="9" rx="2" />
      <path d="M7 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}
