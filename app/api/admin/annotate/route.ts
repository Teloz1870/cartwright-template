import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { generateText } from "ai";
import { chatModelResolved, getAnthropicApiKey } from "@/lib/ai/client";
import { invokeTool } from "@/lib/tools/registry";
import { ADMIN_CHAT_SCOPES } from "@/lib/scopes";
import { auth } from "@/lib/auth";
import { getFeatures } from "@/lib/brand";
import { adminChatRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import {
  createPendingConfirmation,
  consumeConfirmation,
  stripConfirm,
  ConfirmationLimitExceeded,
} from "@/lib/confirmation-tokens";
import { withAuditContext } from "@/lib/audit-context";
import {
  parseTarget,
  targetTool,
  targetLabel,
  bounds,
  fetchCurrent,
  buildArgs,
  validateValue,
} from "@/lib/annotate/targets";
import { buildRewritePrompt, stripQuotesAndTrim } from "@/lib/annotate/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * In-place AI editing ("Annotations") — dedikeret, snævert endpoint bag
 * Auth.js admin-guard. To faser:
 *
 *   propose  { phase, target, note }
 *     → auth + flag + rate-limit + target-allowlist
 *     → hent nuværende værdi autoritativt (genome/Prisma)
 *     → generateText UDEN tools (modellen er reduceret til en tekst-transformer)
 *     → validér forslaget mod target-schemaet → mint confirmation-token
 *     → returnér { before, after, tool, proposedArgs, confirmationToken } (intet skrives)
 *
 *   apply    { phase, target, tool, proposedArgs, confirmationToken }
 *     → genudled tool fra target (stol aldrig på klientens tool-streng)
 *     → consumeConfirmation (args-hash binder propose → apply; manipuleret copy ⇒ afvist)
 *     → invokeTool(tool, {...args, confirm:true}, ADMIN_CHAT_SCOPES) under withAuditContext
 *     → revalidatePath("/", "layout") → returnér den nye værdi
 *
 * Sikkerhed: modellen vælger aldrig et tool (det udledes deterministisk fra
 * target i lib/annotate/targets.ts), og kan aldrig sætte confirm:true selv —
 * det tilføjes først server-side efter et server-udstedt token er konsumeret.
 */
export async function POST(request: NextRequest) {
  // 1. Auth — kun admin (defense-in-depth: aldrig stol på klient-gaten)
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Server-side flag-gate (respekterer DB-override). Klient-gaten er kun UX.
  const features = await getFeatures();
  if (!features.annotateEdit) {
    return Response.json({ error: "In-place editing is disabled" }, { status: 403 });
  }

  // 3. Rate-limit per admin-user-id
  const rl = adminChatRateLimiter.check(session.user.id);
  if (!rl.allowed) return rateLimitResponse(rl);

  // 4. Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  // 5. Target-allowlist (anchored genome-felter + ukendte targets afvises her).
  //    Et manipuleret data-cw-edit-attribut kan højst pege på et andet editbart
  //    felt admin allerede har skrive-scope til.
  const target = parseTarget(b.target);
  if (!target) {
    return Response.json({ error: "Unknown or invalid edit target" }, { status: 400 });
  }
  const expectedTool = targetTool(target);

  const ip = request.headers.get("x-forwarded-for") ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;

  // ── PROPOSE ────────────────────────────────────────────────────────────────
  if (b.phase === "propose") {
    const note = typeof b.note === "string" ? b.note.trim() : "";
    if (note.length < 1 || note.length > 500) {
      return Response.json({ error: "Note must be 1–500 characters" }, { status: 400 });
    }

    // API-key er kun nødvendig i propose (apply kalder ikke modellen).
    const apiKey = await getAnthropicApiKey();
    if (!apiKey) {
      return Response.json(
        { error: "AI is not configured. Add an Anthropic API key in /admin/integrations." },
        { status: 503 },
      );
    }

    const before = await fetchCurrent(target);
    if (before === null) {
      return Response.json({ error: "Edit target not found" }, { status: 404 });
    }

    const { min, max } = bounds(target);
    const { system, prompt } = buildRewritePrompt({
      label: targetLabel(target),
      current: before,
      note,
      min,
      max,
    });

    let after: string;
    try {
      const resolved = await chatModelResolved("chat");
      const out = await generateText({ model: resolved.handle, system, prompt });
      after = stripQuotesAndTrim(out.text);
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "AI request failed" },
        { status: 502 },
      );
    }

    if (!after) {
      return Response.json(
        { error: "AI returned an empty result — try rephrasing the note." },
        { status: 422 },
      );
    }
    const valid = validateValue(target, after);
    if (!valid.ok) {
      // Returnér before/after så UI kan vise hvad der gik galt uden et apply-forsøg.
      return Response.json(
        { error: `AI produced unusable copy: ${valid.error}`, before, after },
        { status: 422 },
      );
    }

    const proposedArgs = await buildArgs(target, after);
    if (!proposedArgs) {
      return Response.json({ error: "Edit target not found" }, { status: 404 });
    }

    let confirmationToken: string;
    try {
      confirmationToken = createPendingConfirmation({
        tool: expectedTool,
        toolArgs: proposedArgs,
        ownerId: session.user.id,
      });
    } catch (err) {
      if (err instanceof ConfirmationLimitExceeded) {
        return Response.json({ error: err.message }, { status: 429 });
      }
      throw err;
    }

    return Response.json({
      before,
      after,
      tool: expectedTool,
      proposedArgs,
      confirmationToken,
    });
  }

  // ── APPLY ──────────────────────────────────────────────────────────────────
  if (b.phase === "apply") {
    // Stol ALDRIG på klientens 'tool'-streng — den skal matche target's tool.
    if (typeof b.tool !== "string" || b.tool !== expectedTool) {
      return Response.json({ error: "Tool does not match target" }, { status: 400 });
    }
    if (typeof b.confirmationToken !== "string" || !b.confirmationToken) {
      return Response.json({ error: "Missing confirmation token" }, { status: 400 });
    }
    if (b.proposedArgs === null || typeof b.proposedArgs !== "object") {
      return Response.json({ error: "Missing proposed args" }, { status: 400 });
    }

    // stripConfirm spejler chat-route: confirm må kun tilføjes server-side
    // EFTER et server-udstedt token er konsumeret. Hash matcher kun hvis klienten
    // har round-trippet proposedArgs uændret (manipuleret copy ⇒ 409).
    const clean = stripConfirm(b.proposedArgs);
    const verify = consumeConfirmation({
      token: b.confirmationToken,
      tool: expectedTool,
      toolArgs: clean,
      ownerId: session.user.id,
    });
    if (!verify.ok) {
      return Response.json({ error: `Confirmation rejected: ${verify.reason}` }, { status: 409 });
    }

    const args = { ...(clean as Record<string, unknown>), confirm: true };

    // Provenance til audit-rows. Apply kalder IKKE modellen, så hvis AI ikke er
    // konfigureret falder vi tilbage til en menneske-stamp i stedet for at fejle.
    let provider = "annotation";
    let model = "inline";
    try {
      const resolved = await chatModelResolved("chat");
      provider = resolved.provider;
      model = resolved.model;
    } catch {
      // AI ikke konfigureret — editen er stadig menneske-bekræftet og gyldig.
    }

    return withAuditContext(
      { provider, model, modality: "text" },
      async () => {
        const result = await invokeTool(
          expectedTool,
          args,
          { actor: `annotation:${session.user.id}`, requestId: randomUUID(), ip, userAgent },
          ADMIN_CHAT_SCOPES,
        );
        if (!result.ok) {
          return Response.json({ error: result.error }, { status: result.status });
        }
        // Bred revalidation — samme hammer som /admin/genome's server-actions:
        // alt under root-layoutet re-renderes, så footer/hero/side/produkt
        // opdateres uanset locale-prefix.
        revalidatePath("/", "layout");
        const value = await fetchCurrent(target);
        return Response.json({ ok: true, value });
      },
    );
  }

  return Response.json({ error: "Unknown phase" }, { status: 400 });
}
