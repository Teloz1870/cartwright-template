import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getBrand } from "@/lib/brand";
import { adminChatRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { planPage } from "@/lib/magic/plan";
import { runPlan } from "@/lib/magic/run-plan";
import { SOURCE_ADAPTERS } from "@/lib/magic/sources";
import { instantPresetResult } from "@/lib/magic/presets";
import type { NodeStatus } from "@/lib/magic/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Magic Builder — STREAMING generate-page endpoint (Mixer 2.0 Phase 3).
 *
 * SSE events, in order:
 *   { type: "preset", layout, vertical, look, matched }   — instant path hit (then "done")
 *   { type: "plan", sections: [{ key, source, effect }] } — render skeletons
 *   { type: "section", index, key, section }              — one node resolved (ANY order;
 *                                                            `index` is the plan position)
 *   { type: "skipped", index, key, reason }               — one node failed (fail-soft)
 *   { type: "done", planned, generated, ms }
 *   { type: "error", error }
 *
 * READ-ONLY like magic.generate_page: plans + generates but writes NOTHING —
 * publish stays a separate human-witnessed pages.set_layout call. Double-gated:
 * admin session + brand.features.magicBuilder. `skipPreset: true` re-runs the
 * full LLM pass (the "re-tone with AI" follow-up after an instant preset hit).
 * The non-streaming paths (magic.generate_page tool, planAndGenerate) are
 * untouched.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = adminChatRateLimiter.check(session.user.id);
  if (!rl.allowed) return rateLimitResponse(rl);

  const brand = await getBrand();
  if (!brand.features.magicBuilder) {
    return Response.json(
      { error: "Magic Builder is not enabled (brand.features.magicBuilder)." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { intent, skipPreset } = body as { intent?: unknown; skipPreset?: unknown };
  if (typeof intent !== "string" || intent.trim().length < 8) {
    return Response.json(
      { error: "Describe the page in a bit more detail (min. 8 characters)." },
      { status: 400 },
    );
  }
  const trimmed = intent.trim();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      const started = Date.now();

      try {
        // 1) INSTANT preset path — deterministic keyword match, zero LLM.
        if (skipPreset !== true) {
          const preset = instantPresetResult(trimmed);
          if (preset) {
            send({ type: "preset", ...preset });
            send({
              type: "done",
              planned: preset.layout.sections.length,
              generated: preset.layout.sections.length,
              ms: Date.now() - started,
            });
            controller.close();
            return;
          }
        }

        // 2) Plan (one LLM call) → skeletons on the client.
        const plan = await planPage(trimmed);
        send({
          type: "plan",
          sections: plan.sections.map((n) => ({
            key: n.key,
            source: n.source,
            ...(n.effect ? { effect: n.effect } : {}),
          })),
        });

        // 3) All sections generate CONCURRENTLY; each is pushed the moment it
        //    settles (fail-soft per node — a skip is reported, never silent).
        const onNode = (index: number, status: NodeStatus) => {
          if (status.state === "done") {
            send({ type: "section", index, key: status.key, section: status.section });
          } else if (status.state === "skipped") {
            send({ type: "skipped", index, key: status.key, reason: status.reason });
          }
        };
        const result = await runPlan(plan, SOURCE_ADAPTERS, onNode);

        send({
          type: "done",
          planned: plan.sections.length,
          generated: result.sections.length,
          ms: Date.now() - started,
        });
      } catch (err) {
        send({
          type: "error",
          error: err instanceof Error ? err.message : "Generation failed",
        });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
