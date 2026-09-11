import { ImageResponse } from "next/og";
import { brand } from "@/brand.config";

/**
 * Favicon — genereres fra brand.logo, samme mærke som header (components/Logo.tsx).
 * Ved klon redigeres brand.logo, ikke denne fil. Erstatter den tidligere statiske
 * app/icon.svg + app/favicon.ico, så mærket kun defineres ét sted.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  const {
    markViewBox,
    markStrokeWidth,
    markTransform,
    markPaths,
    faviconBg,
    faviconFg,
  } = brand.logo;

  const paths = markPaths.map((d) => `<path d="${d}"/>`).join("");
  const inner = markTransform
    ? `<g transform="${markTransform}">${paths}</g>`
    : paths;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" ` +
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
          alignItems: "center",
          justifyContent: "center",
          background: faviconBg,
          borderRadius: 8,
        }}
      >
        <img
          width={24}
          height={24}
          alt=""
          src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`}
        />
      </div>
    ),
    size,
  );
}
