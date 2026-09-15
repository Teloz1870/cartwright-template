import type { Metadata } from "next";

/**
 * Route mount (cartwright-plugin-v1) — three-scenes plugin (full-bleed scene
 * preview). Implementation: plugins/three-scenes/pages/ScenePreviewPage.tsx.
 * Segment config + the noindex metadata stay literal here for Next's static
 * analysis.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Scene preview",
};

export { default } from "@/plugins/three-scenes/pages/ScenePreviewPage";
