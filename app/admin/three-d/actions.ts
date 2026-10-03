/**
 * Re-export shim — the Live Canvas admin server actions moved to the
 * three-scenes plugin (plugins/three-scenes/admin/actions.ts,
 * cartwright-plugin-v1). Keeps the historical import path working unchanged
 * for existing scaffolds.
 */
export { getThreeDForUi, setThreeDAction } from "@/plugins/three-scenes/admin/actions";
export type {
  ThreeDSceneOption,
  ThreeDUiData,
  SetThreeDResult,
} from "@/plugins/three-scenes/admin/actions";
