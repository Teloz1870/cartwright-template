import "server-only";

import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { defineTool } from "@/lib/tools/types";
import { sanitizeVibeHtml } from "@/lib/v0/transform/sanitize";

/**
 * Mockup-first tools — publish/clear a raw-HTML homepage mockup in seconds.
 *
 * The customer flow this serves (see AGENTS.md → "The mockup-first flow"):
 * step 1, the agent generates ONE self-contained HTML mockup of the owner's
 * vision and publishes it with `mockup.set` — the homepage IS the mockup
 * instantly on localhost; step 2, once approved, the agent implements it for
 * real (designs/blank/ or governed sections) and calls `mockup.clear`.
 *
 * Write path = EXACTLY the admin vibe-sandbox's: the homepage is the `Page`
 * row with slug "home", field `vibeHtml` (app/[locale]/page.tsx renders it as
 * a full vibe takeover ABOVE every design — and ABOVE the first-run welcome
 * canvas, whose predicate has a `!homePage?.vibeHtml` leg in lib/first-run.ts).
 * Sanitization = the sandbox's one and only policy for AI-generated HTML,
 * `sanitizeVibeHtml` (lib/v0/transform/sanitize.ts) — no second policy here.
 * Like the sandbox write path, there is no extra size cap on the HTML.
 */

const HOME_SLUG = "home";

const setMockupOutput = z
  .object({
    published: z.literal(true),
    slug: z.literal(HOME_SLUG),
    htmlLength: z.number().int().positive(),
    note: z.string(),
  })
  .strict();

const clearMockupOutput = z.discriminatedUnion("cleared", [
  z
    .object({
      cleared: z.literal(false),
      note: z.string(),
    })
    .strict(),
  z
    .object({
      cleared: z.literal(true),
      slug: z.literal(HOME_SLUG),
      note: z.string(),
    })
    .strict(),
]);

/**
 * The homepage render prefers `translations[locale].vibeHtml` over the base
 * field. A freshly published mockup must win in EVERY locale, so strip stale
 * per-locale vibeHtml entries (keeping all other translation keys) whenever
 * we set or clear the base field.
 */
function stripVibeHtmlFromTranslations(
  translations: Prisma.JsonValue | null,
): Prisma.JsonValue | null {
  if (!translations || typeof translations !== "object" || Array.isArray(translations)) {
    return translations;
  }
  const out: Prisma.JsonObject = {};
  for (const [locale, value] of Object.entries(translations)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const { vibeHtml: _dropped, ...rest } = value as Prisma.JsonObject;
      out[locale] = rest;
    } else {
      out[locale] = value;
    }
  }
  return out;
}

export const setMockup = defineTool({
  name: "mockup.set",
  description:
    "Publish a self-contained HTML mockup as the live homepage (writes the home page's vibeHtml — the same field/sanitizer the admin Vibe Sandbox uses). The vibe takeover renders ABOVE the active design AND above the first-run welcome canvas, so the homepage becomes the mockup instantly. Step 1 of the mockup-first flow: generate → mockup.set → owner reviews on localhost; once approved, implement for real (designs/blank/ or sections) and call mockup.clear. Requires confirm: true. Undo with mockup.clear.",
  scope: "settings:write",
  input: z.object({
    html: z.string().min(1, "html must be a non-empty HTML string"),
    confirm: z.literal(true, { error: "Requires confirm: true" }),
  }),
  output: setMockupOutput,
  examples: [
    {
      name: "Publish a homepage mockup",
      body: {
        html: '<section class="min-h-screen grid place-items-center bg-sol-cream"><h1 class="text-5xl font-bold text-sol-ink">The vision, as a mockup</h1></section>',
        confirm: true,
      },
    },
  ],
  handler: async (args, ctx) => {
    // Same sanitize policy as the vibe sandbox's AI-generation path
    // (sanitizeVibeHtml before anything reaches vibeHtml) — strips <script>,
    // iframes/object/embed, inline event handlers and javascript: URLs.
    const html = sanitizeVibeHtml(args.html);
    if (!html) {
      throw new Error("html was empty after sanitization — nothing to publish");
    }
    return withAudit(
      {
        actor: ctx.actor,
        tool: "mockup.set",
        // Don't log the full HTML blob into the audit args; size + provenance
        // are enough to understand the entry. The before-snapshot keeps the
        // previous state for manual recovery.
        args: { htmlLength: html.length, confirm: true },
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () =>
          prisma.page.findUnique({
            where: { slug: HOME_SLUG },
            select: { id: true, vibeHtml: true, translations: true },
          }),
      },
      async () => {
        const existing = await prisma.page.findUnique({
          where: { slug: HOME_SLUG },
        });
        if (existing) {
          const translations = stripVibeHtmlFromTranslations(existing.translations);
          await prisma.page.update({
            where: { id: existing.id },
            data: {
              vibeHtml: html,
              translations: translations === null ? Prisma.JsonNull : translations,
            },
          });
        } else {
          // Same shape the vibe sandbox creates: a "home" page that exists
          // only to carry the takeover. showInNav stays false so the mockup
          // page never appears in the site nav.
          await prisma.page.create({
            data: {
              slug: HOME_SLUG,
              title: "Home",
              body: "",
              showInNav: false,
              vibeHtml: html,
            },
          });
        }
        return {
          published: true,
          slug: HOME_SLUG,
          htmlLength: html.length,
          note: "The homepage now renders this mockup (vibe takeover). Implement the approved design for real, then call mockup.clear.",
        };
      },
    );
  },
});

export const clearMockup = defineTool({
  name: "mockup.clear",
  description:
    "Remove the homepage mockup (nulls the home page's vibeHtml so the active design renders again). Note: clearing does NOT resurrect the first-run welcome canvas if the site was otherwise touched (its predicate retires permanently on any design/copy/product/setup change — correct behavior). Step 2 of the mockup-first flow, after the mockup is implemented for real. Requires confirm: true.",
  scope: "settings:write",
  input: z.object({
    confirm: z.literal(true, { error: "Requires confirm: true" }),
  }),
  output: clearMockupOutput,
  examples: [{ name: "Clear the homepage mockup", body: { confirm: true } }],
  handler: async (_args, ctx) => {
    return withAudit(
      {
        actor: ctx.actor,
        tool: "mockup.clear",
        args: { confirm: true },
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () =>
          prisma.page.findUnique({
            where: { slug: HOME_SLUG },
            select: { id: true, vibeHtml: true, translations: true },
          }),
      },
      async () => {
        const existing = await prisma.page.findUnique({
          where: { slug: HOME_SLUG },
        });
        if (!existing || !existing.vibeHtml) {
          return { cleared: false, note: "No homepage mockup was set." };
        }
        const translations = stripVibeHtmlFromTranslations(existing.translations);
        await prisma.page.update({
          where: { id: existing.id },
          data: {
            vibeHtml: null,
            translations: translations === null ? Prisma.JsonNull : translations,
          },
        });
        return {
          cleared: true,
          slug: HOME_SLUG,
          note: "The homepage renders the active design again.",
        };
      },
    );
  },
});

export const mockupTools = [setMockup, clearMockup];
