import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { fetchGoogleDoc } from "@/lib/google/docs";
import { defineTool } from "@/lib/tools/types";
import { upsertPage } from "@/lib/tools/pages";
import { brand } from "@/brand.config";
import { canonicalPublicPagePath } from "@/lib/canonical-public-routes";

const importInput = z.object({
  documentId: z.string().min(1, "Google Doc id or URL is required"),
  target: z.enum(["post", "page"]),
});

const importedDocumentOutput = z.discriminatedUnion("target", [
  z.object({
    target: z.literal("page"),
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    adminUrl: z.string(),
    publicUrl: z.string(),
  }).strict(),
  z.object({
    target: z.literal("post"),
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    adminUrl: z.string(),
    publicUrl: z.string(),
  }).strict(),
]);

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[æ]/g, "ae")
    .replace(/[ø]/g, "oe")
    .replace(/[å]/g, "aa")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `google-doc-${Date.now()}`;
}

async function uniquePostSlug(base: string): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while (await prisma.post.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export const importGoogleDoc = defineTool({
  name: "docs.import",
  description:
    "Import a Google Doc into Cartwright content as a draft blog post or public CMS page. Uses the shared Google OAuth connector.",
  scope: "pages:write",
  input: importInput,
  output: importedDocumentOutput,
  examples: [
    {
      name: "Import a Google Doc as a page",
      body: {
        documentId: "https://docs.google.com/document/d/1abcDEF456/edit",
        target: "page",
      },
    },
  ],
  handler: async (args, ctx) => {
    const doc = await fetchGoogleDoc(args.documentId);
    if (!doc.ok) {
      throw new Error(doc.error.message);
    }

    const title = doc.title;
    // Imported as engine markdown (text), never HTML — rendered through the safe
    // renderContentBlocks() path. bodyFormat="text" makes that provenance explicit.
    const body = doc.markdown.trim();
    if (!body) {
      throw new Error("Google Doc did not contain importable text content.");
    }

    const baseSlug = slugify(title);

    if (args.target === "page") {
      // Imported content lands as a DRAFT (matches the post target + this tool's
      // description) — an owner reviews before it hits the public storefront.
      const page = await upsertPage.handler(
        { slug: baseSlug, title, body, status: "draft" },
        ctx,
      );
      await prisma.page.update({
        where: { id: page.id },
        data: { bodyFormat: "text" },
      });
      return {
        target: "page" as const,
        id: page.id,
        slug: page.slug,
        title: page.title,
        adminUrl: `/admin/sider/${page.id}`,
        publicUrl: canonicalPublicPagePath(page.slug, brand.defaultLocale),
      };
    }

    const slug = await uniquePostSlug(baseSlug);
    return withAudit(
      {
        actor: ctx.actor,
        tool: "docs.import",
        args: { ...args, documentId: "[redacted-google-doc-id]", target: args.target },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
      async () => {
        const post = await prisma.post.create({
          data: {
            slug,
            title,
            body,
            bodyFormat: "text",
            status: "draft",
            excerpt: null,
            coverImage: null,
            author: null,
            tags: null,
            metaTitle: null,
            metaDescription: null,
            publishedAt: null,
          },
        });
        return {
          target: "post" as const,
          id: post.id,
          slug: post.slug,
          title: post.title,
          adminUrl: `/admin/blog/${post.id}`,
          publicUrl: `/blog/${post.slug}`,
        };
      },
    );
  },
});

export const docsTools = [importGoogleDoc];
