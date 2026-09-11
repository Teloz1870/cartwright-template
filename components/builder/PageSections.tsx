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
import { sectionEffectClass } from "@/lib/builder/effects";

export function PageSections({ sections }: { sections: ResolvedSection[] }) {
  return (
    <>
      {sections.map((s) => {
        const Component = SECTION_REGISTRY[s.key]
          .Component as ComponentType<Record<string, unknown>>;
        // PART 4: wrap in the motion utility class ONLY when an effect is set.
        // No effect ⇒ bare Fragment ⇒ byte-identical render (canary invariant).
        const motionClass = sectionEffectClass(s.effect);
        if (motionClass) {
          return (
            <div key={s.id} className={motionClass}>
              <Component {...s.props} />
            </div>
          );
        }
        return (
          <Fragment key={s.id}>
            <Component {...s.props} />
          </Fragment>
        );
      })}
    </>
  );
}
