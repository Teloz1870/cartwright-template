/**
 * Visual Builder — resolve et page section-tree til render-klare nodes.
 *
 * Isomorf (ingen `server-only`, ingen DB): bruges af BÅDE storefront-render
 * (server, `InfoPage`) og live-preview (client). Tager den rå `layoutJson`,
 * parser/validerer, og returnerer kun de `enabled` sektioner i array-rækkefølge
 * med props udfyldt (eksplicitte props ?? sektionens defaultProps).
 *
 * Returnerer [] ved null/invalid → render-laget falder tilbage til body/vibeHtml.
 */
import { parsePageLayout } from "./section-schema";
import { SECTION_REGISTRY, type SectionKey } from "./section-registry";

export type ResolvedSection = {
  id: string;
  key: SectionKey;
  props: Record<string, unknown>;
};

export function resolvePageLayout(
  raw: string | null | undefined,
): ResolvedSection[] {
  const layout = parsePageLayout(raw);
  if (!layout) return [];

  return layout.sections
    .filter((s) => s.enabled)
    .map((s) => {
      const key = s.key as SectionKey;
      return {
        id: s.id,
        key,
        props: (s.props ?? SECTION_REGISTRY[key].defaultProps) as Record<
          string,
          unknown
        >,
      };
    });
}
