import { ImageResponse } from "next/og";
import { brand } from "@/brand.config";

/**
 * Brand-themed Open Graph card (1200×630). Shared by:
 *  - `app/opengraph-image.tsx` — the site-wide fallback card.
 *  - `app/og/route.tsx` — per-page cards (`/og?title=…&description=…`).
 *
 * Branded purely from brand.config (logo + faviconBg/faviconFg colors) so
 * fork-shops get correct cards without editing this file. This is the only
 * module that imports `next/og`, so page bundles stay light.
 */
export const OG_SIZE = { width: 1200, height: 630 } as const;

export function renderBrandOgCard({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}): ImageResponse {
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
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori/ImageResponse requires a plain <img>; next/image does not work here. */}
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
            maxWidth: 1040,
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div
            style={{
              marginTop: 20,
              fontSize: 32,
              opacity: 0.75,
              maxWidth: 900,
              lineHeight: 1.3,
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
    ),
    OG_SIZE,
  );
}
