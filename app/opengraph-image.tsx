import { ImageResponse } from "next/og";
import { brand } from "@/brand.config";

/**
 * Site-wide Open Graph / social-share image (1200×630).
 *
 * Next.js auto-applies this file as `og:image` (+ `twitter:image`) for every
 * route that doesn't set its own — so home, PLP, info, contact, account pages
 * get a branded social card instead of no preview. The PDP still overrides this
 * with the actual product image via its generateMetadata.
 *
 * Branded purely from brand.config (storeName, metadata.description, logo
 * colors) so fork-shops get a correct card without editing this file.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = brand.storeName;

export default function OpengraphImage() {
  const { markViewBox, markStrokeWidth, markTransform, markPaths, faviconBg, faviconFg } =
    brand.logo;

  const paths = markPaths.map((d) => `<path d="${d}"/>`).join("");
  const inner = markTransform ? `<g transform="${markTransform}">${paths}</g>` : paths;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" ` +
    `viewBox="${markViewBox}" fill="none" stroke="${faviconFg}" ` +
    `stroke-width="${markStrokeWidth}" stroke-linecap="round" ` +
    `stroke-linejoin="round">${inner}</svg>`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: faviconBg,
          color: faviconFg,
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        <img
          width={120}
          height={120}
          alt=""
          src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`}
        />
        <div
          style={{
            marginTop: 40,
            fontSize: 76,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
          }}
        >
          {brand.storeName}
        </div>
        <div
          style={{
            marginTop: 20,
            fontSize: 32,
            opacity: 0.75,
            maxWidth: 900,
            lineHeight: 1.3,
          }}
        >
          {brand.metadata.description}
        </div>
      </div>
    ),
    size,
  );
}
