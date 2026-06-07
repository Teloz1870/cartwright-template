import type { SectionRegistry } from "@/designs/layout-types";

export const studioLayoutRegistry: SectionRegistry = {
  hero: { order: 10, enabledByDefault: true, required: true },
  valueProps: { order: 20, enabledByDefault: true },
  featureGrid: { order: 30, enabledByDefault: true },
  howItWorks: { order: 40, enabledByDefault: true },
  stackGrid: { order: 50, enabledByDefault: true },
  ctaFooter: { order: 60, enabledByDefault: true, required: true },
};
