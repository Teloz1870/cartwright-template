/**
 * Renders a resolved page section-tree via the deterministic section-registry.
 *
 * Shared by the storefront render-seam (`InfoPage`, server) and the live-preview
 * (client) — single render path so the two can never diverge. Presentational
 * only; no server-only deps so it can be bundled into the client preview.
 */
import { Fragment, type ComponentType } from "react";
import { SECTION_REGISTRY } from "@/lib/builder/section-registry";
import type { ResolvedSection } from "@/lib/builder/page-layout";

export function PageSections({ sections }: { sections: ResolvedSection[] }) {
  return (
    <>
      {sections.map((s) => {
        const Component = SECTION_REGISTRY[s.key]
          .Component as ComponentType<Record<string, unknown>>;
        return (
          <Fragment key={s.id}>
            <Component {...s.props} />
          </Fragment>
        );
      })}
    </>
  );
}
