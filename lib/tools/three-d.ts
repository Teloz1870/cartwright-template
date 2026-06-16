import "server-only";

import { z } from "zod";
import { defineTool } from "@/lib/tools/types";
import { SCENE_IDS, SCENE_REGISTRY } from "@/lib/three/scenes/registry";
import { getActiveThreeDConfig } from "@/lib/three/resolve";
import { applyThreeDConfig } from "@/lib/three/apply";

/**
 * AI tools for the Cartwright Live Canvas — the AI-first differentiator: an
 * operator says "make the vibe calm and cosmic" and the assistant calls
 * three.configure. Shares applyThreeDConfig / getActiveThreeDConfig with
 * /admin/three-d (one code path). Scope reuses settings:read/write (3D config
 * is a setting) — admin-only, never customer chat.
 */

const sceneEnum = z.enum(SCENE_IDS as [string, ...string[]]);

export const getThreeDTool = defineTool({
  name: "three.get",
  description:
    "Get the current Live Canvas 3D config (scene, intensity 0..1, paletteSource) and the list of available scenes with descriptions. Read-only.",
  scope: "settings:read",
  input: z.object({}),
  skipAudit: true,
  handler: async () => ({
    config: await getActiveThreeDConfig(),
    scenes: SCENE_IDS.map((id) => ({
      id,
      label: SCENE_REGISTRY[id].label,
      description: SCENE_REGISTRY[id].description,
    })),
  }),
});

export const configureThreeDTool = defineTool({
  name: "three.configure",
  description:
    "Configure the Live Canvas 3D hero. scene: floating-geometry | particles | blob | wireframe | aurora. intensity: 0..1 (density/speed). paletteSource: theme | custom. Any subset may be set. Applies instantly (30s cache). Requires confirm: true. Revertible via audit.revert.",
  scope: "settings:write",
  revertible: true,
  input: z.object({
    scene: sceneEnum.optional(),
    intensity: z.number().min(0).max(1).optional(),
    paletteSource: z.enum(["theme", "custom"]).optional(),
    confirm: z.literal(true, { error: "Requires confirm: true" }),
  }),
  examples: [
    {
      name: "Calm cosmic vibe",
      body: { scene: "particles", intensity: 0.4, confirm: true },
    },
  ],
  handler: async (args, ctx) => {
    const { confirm: _confirm, ...patch } = args;
    const result = await applyThreeDConfig(patch, ctx.actor);
    if (!result.ok) throw new Error(result.error);
    return result;
  },
});

export const threeDTools = [getThreeDTool, configureThreeDTool];
