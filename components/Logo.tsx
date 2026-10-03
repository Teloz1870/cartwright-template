import { brand as defaultBrand } from "@/brand.config";
import type { MergedBrand } from "@/lib/brand";

type LogoProps = {
  className?: string;
  storeName?: string;
  logo?: MergedBrand["logo"];
};

// Logo-mærket kommer fra brand.logo — single source of truth (se brand.config.ts).
// Samme mærke genbruges i faviconen (app/icon.tsx). Ved klon: rediger brand.logo,
// ikke denne fil. Text-delen kommer dynamisk fra brand.storeName.
export default function Logo({ className, storeName, logo }: LogoProps) {
  const activeLogo = (logo ?? { ...defaultBrand.logo, imageUrl: null }) as MergedBrand["logo"];
  const { markViewBox, markClass, markStrokeWidth, markTransform, markPaths, imageUrl } =
    activeLogo;
  const paths = markPaths.map((d: string, i: number) => <path key={i} d={d} />);
  return (
    <span
      className={["inline-flex items-center gap-2", className]
        .filter(Boolean)
        .join(" ")}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- dynamic brand-logo src from DB (may be SVG/remote), unknown build-time dimensions
        <img src={imageUrl} alt={storeName ?? defaultBrand.storeName} className={`${markClass} shrink-0 object-contain`} />
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox={markViewBox}
          className={`${markClass} shrink-0`}
          fill="none"
          stroke="currentColor"
          strokeWidth={markStrokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {markTransform ? <g transform={markTransform}>{paths}</g> : paths}
        </svg>
      )}
      <span className="font-black text-xl tracking-tight">{storeName ?? defaultBrand.storeName}</span>
    </span>
  );
}
