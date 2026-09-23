/**
 * Single requestAnimationFrame loop with delta-time clamping and an adaptive
 * quality controller. One loop for the whole Live Canvas — never per-scene.
 *
 * Quality starts at 1 and steps down (1 → 0.66 → 0.33) when the rolling mean
 * FPS drops below the floor for a sample window. The orchestrator maps quality
 * to DPR + forwards it to the active scene's setQuality() so weak GPUs degrade
 * gracefully instead of dropping frames. Quality never auto-recovers within a
 * session (avoids oscillation) — a fresh mount resets it.
 */

export type FrameLoop = {
  start(): void;
  stop(): void;
  readonly running: boolean;
};

export type FrameCallback = (dt: number, elapsed: number, quality: number) => void;

const MAX_DT = 0.1; // clamp big gaps (tab refocus) so nothing "jumps"
const SAMPLE_SECONDS = 0.5;
const FPS_FLOOR = 45;
const QUALITY_STEPS = [1, 0.66, 0.33];

export function createFrameLoop(onFrame: FrameCallback): FrameLoop {
  let rafId = 0;
  let last = 0;
  let startTs = 0;
  let running = false;

  let qualityIndex = 0;
  let frames = 0;
  let acc = 0;

  const tick = (now: number) => {
    if (!running) return;
    if (!last) {
      last = now;
      startTs = now;
    }
    let dt = (now - last) / 1000;
    last = now;
    if (dt > MAX_DT) dt = MAX_DT;
    const elapsed = (now - startTs) / 1000;

    // Rolling FPS sample → step quality down if sustained-slow.
    frames += 1;
    acc += dt;
    if (acc >= SAMPLE_SECONDS) {
      const fps = frames / acc;
      if (fps < FPS_FLOOR && qualityIndex < QUALITY_STEPS.length - 1) {
        qualityIndex += 1;
      }
      frames = 0;
      acc = 0;
    }

    onFrame(dt, elapsed, QUALITY_STEPS[qualityIndex]);
    rafId = requestAnimationFrame(tick);
  };

  return {
    get running() {
      return running;
    },
    start() {
      if (running) return;
      running = true;
      last = 0; // re-baseline so the first dt isn't a huge gap
      rafId = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    },
  };
}

/** Clamp device pixel ratio — capped harder on mobile to protect thermals. */
export function clampDpr(quality = 1): number {
  if (typeof window === "undefined") return 1;
  const isMobile =
    typeof navigator !== "undefined" &&
    /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const ceiling = isMobile ? 1.5 : 2;
  return Math.min(window.devicePixelRatio || 1, ceiling) * quality;
}
