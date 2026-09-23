/**
 * Studio configurator — a "Build your own" interactive product configurator (a
 * Cartwright **Pro** Part). Pick options per group (colour / size / material…) →
 * a live CSS product preview that recolours + a live total price + CTA. The
 * killer commerce primitive: a $100k-feeling configurator on any page.
 *
 * This file is a SERVER module (no "use client") so the section registry — which
 * is read server-side — gets the REAL schema + defaults (exports of a "use
 * client" module become client references and lose their data). It re-exports
 * the interactive island (./ConfiguratorClient) as the section Component. Mirrors
 * the heroAurora pattern (server wrapper + client child).
 */
import { z } from "zod";
import { ConfiguratorClient } from "./ConfiguratorClient";

const choiceSchema = z.object({
  label: z.string().min(1),
  /** For a "colour" group: a CSS colour (hex). For "option": a free value/note. */
  value: z.string().min(1),
  priceDelta: z.number().default(0),
});

const groupSchema = z.object({
  label: z.string().min(1),
  kind: z.enum(["colour", "option"]).default("option"),
  choices: z.array(choiceSchema).min(1).max(8),
});

export const configuratorSchema = z
  .object({
    eyebrow: z.string().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    productName: z.string().min(1),
    basePrice: z.number().min(0),
    currency: z.string().default("$"),
    groups: z.array(groupSchema).min(1).max(5),
    ctaLabel: z.string().default("Add to cart"),
    ctaHref: z.string().default("#"),
    note: z.string().optional(),
  })
  .strict();

export type StudioConfiguratorProps = z.infer<typeof configuratorSchema>;

export const configuratorDefaults: StudioConfiguratorProps = {
  eyebrow: "Build your own",
  title: "Make it yours.",
  description: "Pick a finish, a size, and the extras you want — the price updates as you go.",
  productName: "The Signature",
  basePrice: 149,
  currency: "$",
  groups: [
    {
      label: "Finish",
      kind: "colour",
      choices: [
        { label: "Midnight", value: "#1f2937", priceDelta: 0 },
        { label: "Terracotta", value: "#c2630a", priceDelta: 0 },
        { label: "Sage", value: "#4b6b54", priceDelta: 0 },
        { label: "Ivory", value: "#e9e4d8", priceDelta: 0 },
      ],
    },
    {
      label: "Size",
      kind: "option",
      choices: [
        { label: "Compact", value: "S", priceDelta: 0 },
        { label: "Standard", value: "M", priceDelta: 20 },
        { label: "Grand", value: "L", priceDelta: 40 },
      ],
    },
    {
      label: "Extras",
      kind: "option",
      choices: [
        { label: "None", value: "none", priceDelta: 0 },
        { label: "Engraving", value: "engrave", priceDelta: 25 },
        { label: "Gift box", value: "gift", priceDelta: 15 },
      ],
    },
  ],
  ctaLabel: "Add to cart",
  ctaHref: "#",
  note: "Free shipping · 30-day returns · Made to order",
};

/** Server wrapper → renders the interactive client island. */
export function StudioConfigurator(props: StudioConfiguratorProps) {
  return <ConfiguratorClient {...props} />;
}
