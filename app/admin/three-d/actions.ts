"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import { SCENE_IDS, SCENE_REGISTRY } from "@/lib/three/scenes/registry";
import { getActiveThreeDConfig, type ThreeDConfig } from "@/lib/three/resolve";
import { applyThreeDConfig, type ThreeDPatch } from "@/lib/three/apply";

export type ThreeDSceneOption = {
  id: string;
  label: string;
  description: string;
};

export type ThreeDUiData = {
  config: ThreeDConfig;
  scenes: ThreeDSceneOption[];
};

export async function getThreeDForUi(): Promise<ThreeDUiData> {
  await requireAdmin();
  return {
    config: await getActiveThreeDConfig(),
    scenes: SCENE_IDS.map((id) => ({
      id,
      label: SCENE_REGISTRY[id].label,
      description: SCENE_REGISTRY[id].description,
    })),
  };
}

export type SetThreeDResult =
  | { ok: true; config: ThreeDConfig }
  | { ok: false; error: string };

export async function setThreeDAction(patch: ThreeDPatch): Promise<SetThreeDResult> {
  const session = await requireAdmin();
  const result = await applyThreeDConfig(patch, `user:${session.user.id}`);
  if (!result.ok) return result;
  revalidatePath("/admin/three-d");
  revalidatePath("/", "layout"); // storefront hero re-resolves on next render
  return { ok: true, config: result.config };
}
