"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Edit-mode-state for in-place AI editing. Mounted i app/[locale]/layout.tsx med
 * `enabled = isAdmin && annotateEdit`. Når `enabled` er false er hele featuren en
 * no-op: overlayet rendrer intet, og editAttr() lægger ingen attributter på DOM.
 *
 * Provideren holder kun on/off-toggle-state — al interaktions-state (valgt
 * element, propose/apply-fase) lever i EditModeOverlay. Det holder context'en
 * lille og re-render-billig.
 */
type EditModeCtx = {
  /** isAdmin && features.annotateEdit — sat én gang server-side. */
  enabled: boolean;
  /** Om admin har slået redigerings-tilstand til lige nu. */
  editMode: boolean;
  setEditMode: (on: boolean) => void;
};

const Ctx = createContext<EditModeCtx | null>(null);

export function EditModeProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [editMode, setEditMode] = useState(false);
  return (
    <Ctx.Provider value={{ enabled, editMode, setEditMode }}>
      {children}
    </Ctx.Provider>
  );
}

export function useEditMode(): EditModeCtx {
  return (
    useContext(Ctx) ?? { enabled: false, editMode: false, setEditMode: () => {} }
  );
}
