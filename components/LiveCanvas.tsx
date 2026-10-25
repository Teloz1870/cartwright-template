/**
 * Re-export shim — the implementation moved to the three-scenes plugin
 * (plugins/three-scenes/, cartwright-plugin-v1). Keeps the historical import
 * path (`@/components/LiveCanvas`) working unchanged for existing scaffolds.
 * Never import this directly from a design pack — always go through
 * `@/components/ThreeHero` (dynamic, ssr:false).
 */
export { default } from "@/plugins/three-scenes/components/LiveCanvas";
