import "server-only";

import { z } from "zod";
import { brand } from "@/brand.config";
import { withAudit } from "@/lib/audit";
import { defineTool } from "@/lib/tools/types";
import { scrapeSite } from "@/lib/import/scrape-site";
import { runImport } from "@/lib/import/run-import";

/**
 * Site-import — the one-call onboarding flow: scrape an existing site and
 * rebuild it as Cartwright DRAFTS.
 *
 * Pipeline: Firecrawl map+scrape (scrapeSite) → deterministic classify+plan →
 * create each page/service/blog post as a DRAFT via the tool surface, importing
 * each hero image into Blob (images.import_from_url). NOTHING goes live — the
 * owner reviews + rephrases the scraped copy through the brand voice (REBUILD,
 * not clone) and publishes from the admin. Needs FIRECRAWL_API_KEY (scrape) and
 * BLOB_READ_WRITE_TOKEN (images); both fail soft (a missing image just means no
 * hero, a missing Firecrawl key returns a friendly error).
 */

const importInput = z.object({
  url: z.string().url(),
  maxPages: z.number().int().min(1).max(200).optional(),
  confirm: z.literal(true, { error: "Requires confirm: true" }),
});

export const importSite = defineTool({
  name: "content.import_site",
  description:
    "Scrape an existing website by URL and rebuild it as Cartwright content — every page/service/blog post is created as a DRAFT (nothing goes live) with its hero image imported, ready for the owner to review, rephrase, and publish. Products are skipped in this version. Needs FIRECRAWL_API_KEY. Requires confirm: true (it uses scrape credits and creates many drafts).",
  scope: "settings:write",
  input: importInput,
  examples: [{ name: "Import a site as drafts", body: { url: "https://example.com", maxPages: 30, confirm: true } }],
  handler: async (args, ctx) => {
    return withAudit(
      {
        actor: ctx.actor,
        tool: "content.import_site",
        args,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () => Promise.resolve(null),
      },
      async () => {
        // Default-off until the admin review UI ships (ultraplan §8 guardrail).
        if (!(brand.features as { siteImport?: boolean }).siteImport) {
          throw new Error("Site-import is disabled. Enable the 'siteImport' feature flag (/admin/features) first.");
        }
        const scraped = await scrapeSite(args.url, { maxPages: args.maxPages });
        if (!scraped.ok) throw new Error(scraped.error);
        const result = await runImport(scraped.archive, ctx);
        return result;
      },
    );
  },
});

export const importTools = [importSite];
