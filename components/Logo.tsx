import { brand } from "@/brand.config";

type LogoProps = {
  className?: string;
};

// SVG-mark forbliver solbrille-formet (to brille-glas). Ved klon: erstat SVG-path
// med ny mærke-form. Text-delen kommer dynamisk fra brand.storeName.
export default function Logo({ className }: LogoProps) {
  return (
    <span
      className={["inline-flex items-center gap-2", className]
        .filter(Boolean)
        .join(" ")}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 40 20"
        className="h-6 w-12 shrink-0"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4 9.5C4 7.6 5.6 6 7.5 6h7C16.4 6 18 7.6 18 9.5v3c0 2.5-2 4.5-4.5 4.5h-5C6 17 4 15 4 12.5v-3Zm18 0C22 7.6 23.6 6 25.5 6h7C34.4 6 36 7.6 36 9.5v3c0 2.5-2 4.5-4.5 4.5h-5C24 17 22 15 22 12.5v-3Z"
          fill="currentColor"
        />
        <path
          d="M4 9 1.5 7M18 10h4M36 9l2.5-2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="font-black text-xl tracking-tight">{brand.storeName}</span>
    </span>
  );
}
