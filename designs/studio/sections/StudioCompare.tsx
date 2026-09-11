/**
 * Studio compare — an interactive before/after slider (a Cartwright **Pro**
 * Part). Drag the handle to wipe between two states — same/with, plain/premium,
 * before/after. Works with two images, or pure-CSS gradient panels as a template
 * default. A classic premium element, on any page.
 *
 * SERVER module (no "use client") so the section registry reads the real schema +
 * defaults (a "use client" module's exports become client references server-side
 * and lose their data). Re-exports the interactive island (./CompareClient).
 */
import { z } from "zod";
import { CompareClient } from "./CompareClient";

export const compareSchema = z
  .object({
    eyebrow: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    beforeLabel: z.string().default("Before"),
    afterLabel: z.string().default("After"),
    beforeSrc: z.string().optional(),
    afterSrc: z.string().optional(),
  })
  .strict();

export type StudioCompareProps = z.infer<typeof compareSchema>;

export const compareDefaults: StudioCompareProps = {
  eyebrow: "See the difference",
  title: "Before, and after.",
  description: "Drag the handle to compare — or use the arrow keys. The same shot, the difference plain to see.",
  beforeLabel: "Before",
  afterLabel: "After",
};

/** Server wrapper → renders the interactive client island. */
export function StudioCompare(props: StudioCompareProps) {
  return <CompareClient {...props} />;
}
