import type { EditTarget } from "@/lib/annotate/types";

/**
 * Spread-helper der vedhæfter et `data-cw-edit`-attribut til et copy-element —
 * men KUN når edit-mode er aktiveret (admin + annotateEdit-flag). Når
 * `editEnabled` er false/undefined returneres et tomt objekt, så ikke-admin-DOM
 * er byte-identisk med før (ingen attributter lækker til offentligheden).
 *
 *   <h1 {...editAttr({ kind: "setting", field: "websiteHeadline" }, editEnabled)}>
 *     {headline}
 *   </h1>
 *
 * Importérbar fra både server-komponenter og klient-overlay (ingen server-only
 * afhængigheder — typen kommer fra lib/annotate/types.ts).
 */
export function editAttr(
  target: EditTarget,
  editEnabled: boolean | undefined,
): Record<string, string> {
  return editEnabled ? { "data-cw-edit": JSON.stringify(target) } : {};
}

export type { EditTarget };
