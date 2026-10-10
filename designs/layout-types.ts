export type SectionRegistryEntry = {
  order: number;
  enabledByDefault: boolean;
  required?: boolean;
};

export type SectionRegistry = Record<string, SectionRegistryEntry>;

export type LayoutConfig = {
  sections: Array<{ key: string; enabled: boolean }>;
};

export function resolveSectionOrder(
  registry: SectionRegistry,
  config: LayoutConfig | null,
): string[] {
  if (config === null) {
    return Object.entries(registry)
      .filter(([, entry]) => entry.enabledByDefault)
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([key]) => key);
  }

  const seen = new Set<string>();
  const sections = config.sections.map((section) => ({ ...section }));
  const resolved: string[] = [];

  for (const section of sections) {
    const entry = registry[section.key];
    if (!entry) continue;
    seen.add(section.key);
    if (section.enabled || entry.required === true) {
      resolved.push(section.key);
    }
  }

  const missingRequired = Object.entries(registry)
    .filter(([key, entry]) => entry.required === true && !seen.has(key))
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([key]) => key);

  return [...resolved, ...missingRequired];
}
