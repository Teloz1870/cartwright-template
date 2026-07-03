import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { defineTool } from "@/lib/tools/types";
import { slugify } from "@/lib/tools/slug";

/**
 * Blog post tools — the create/update/publish surface the Post model lacked.
 *
 * Before this, the only Post.create path was docs.import (Google-Doc-bound), so
 * an agent (or the site-import pipeline) had no way to land a blog post from
 * arbitrary markdown. Posts always land as DRAFT (Post.status) — publishing is a
 * separate, explicit step. Body is engine markdown (bodyFormat="text", the safe
 * renderContentBlocks path — never raw HTML). Scope reuses pages:write (the same
 * "Indhold" content scope docs.import uses).
 */

const slugRule = z
  .string()
  .min(2)
  .regex(/^[a-z0-9-]+$/, "slug may only contain a-z, 0-9, and hyphens");

async function uniquePostSlug(base: string): Promise<string> {
  let candidate = base;
  let n = 2;
  while (await prisma.post.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

const createInput = z.object({
  title: z.string().min(2),
  body: z.string().min(10),
  slug: slugRule.optional(),
  excerpt: z.string().optional(),
  coverImage: z.string().url().optional(),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
});

export const listPosts = defineTool({
  name: "posts.list",
  description: "List blog posts with slug, title, status (draft|published), and update timestamp.",
  scope: "pages:read",
  input: z.object({}),
  examples: [{ name: "List all posts", body: {} }],
  skipAudit: true,
  handler: async () => {
    return prisma.post.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, slug: true, title: true, status: true, updatedAt: true },
    });
  },
});

export const createPost = defineTool({
  name: "posts.create",
  description:
    "Create a blog post (lands as a DRAFT). Body is markdown (## headers + blank-line paragraphs). Auto-slugs from the title when no slug is given. Publish separately with posts.publish.",
  scope: "pages:write",
  input: createInput,
  examples: [
    {
      name: "Draft a post",
      body: { title: "Our spring collection", body: "## Fresh in\n\nThe spring line has landed." },
    },
  ],
  handler: async (args, ctx) => {
    return withAudit(
      {
        actor: ctx.actor,
        tool: "posts.create",
        args,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () => Promise.resolve(null),
      },
      async () => {
        let slug: string;
        if (args.slug) {
          const taken = await prisma.post.findUnique({ where: { slug: args.slug }, select: { id: true } });
          if (taken) throw new Error(`A post with slug "${args.slug}" already exists — use posts.update.`);
          slug = args.slug;
        } else {
          slug = await uniquePostSlug(slugify(args.title, "post"));
        }
        let post;
        try {
          post = await prisma.post.create({
            data: {
              slug,
              title: args.title,
              body: args.body,
              bodyFormat: "text",
              excerpt: args.excerpt ?? null,
              coverImage: args.coverImage ?? null,
              author: args.author ?? null,
              status: "draft",
              tags: args.tags ? JSON.stringify(args.tags) : null,
              metaTitle: args.metaTitle ?? null,
              metaDescription: args.metaDescription ?? null,
              publishedAt: null,
            },
          });
        } catch (e) {
          // A concurrent create can win the slug between our check and this call
          // (Prisma P2002 unique constraint) — surface the same friendly error.
          if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
            throw new Error(`A post with slug "${slug}" already exists — use posts.update.`);
          }
          throw e;
        }
        return { id: post.id, slug: post.slug, status: post.status, publicUrl: `/blog/${post.slug}` };
      },
    );
  },
});

const updateInput = z.object({
  slug: slugRule,
  title: z.string().min(2).optional(),
  body: z.string().min(10).optional(),
  // Nullable so a field can be CLEARED (pass null) as well as set or left alone.
  excerpt: z.string().nullable().optional(),
  coverImage: z.string().url().nullable().optional(),
  author: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  metaTitle: z.string().nullable().optional(),
  metaDescription: z.string().nullable().optional(),
});

export const updatePost = defineTool({
  name: "posts.update",
  description: "Update an existing blog post's fields by slug. Does not change publish status (use posts.publish).",
  scope: "pages:write",
  input: updateInput,
  examples: [{ name: "Fix a title", body: { slug: "our-spring-collection", title: "Our spring 2026 collection" } }],
  handler: async (args, ctx) => {
    return withAudit(
      {
        actor: ctx.actor,
        tool: "posts.update",
        args,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () => prisma.post.findUnique({ where: { slug: args.slug } }),
      },
      async () => {
        const existing = await prisma.post.findUnique({ where: { slug: args.slug }, select: { id: true } });
        if (!existing) throw new Error(`Post not found: ${args.slug}`);
        const post = await prisma.post.update({
          where: { slug: args.slug },
          data: {
            ...(args.title !== undefined ? { title: args.title } : {}),
            ...(args.body !== undefined ? { body: args.body, bodyFormat: "text" } : {}),
            ...(args.excerpt !== undefined ? { excerpt: args.excerpt } : {}),
            ...(args.coverImage !== undefined ? { coverImage: args.coverImage } : {}),
            ...(args.author !== undefined ? { author: args.author } : {}),
            ...(args.tags !== undefined ? { tags: args.tags === null ? null : JSON.stringify(args.tags) } : {}),
            ...(args.metaTitle !== undefined ? { metaTitle: args.metaTitle } : {}),
            ...(args.metaDescription !== undefined ? { metaDescription: args.metaDescription } : {}),
          },
        });
        return { id: post.id, slug: post.slug, status: post.status };
      },
    );
  },
});

const publishInput = z.object({
  slug: slugRule,
  published: z.boolean().default(true),
  confirm: z.literal(true, { error: "Requires confirm: true" }),
});

export const publishPost = defineTool({
  name: "posts.publish",
  description:
    "Publish a draft blog post (or unpublish it back to draft with published:false). Sets publishedAt on first publish. Requires confirm: true.",
  scope: "pages:write",
  input: publishInput,
  examples: [{ name: "Publish a post", body: { slug: "our-spring-collection", published: true, confirm: true } }],
  handler: async (args, ctx) => {
    return withAudit(
      {
        actor: ctx.actor,
        tool: "posts.publish",
        args,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () => prisma.post.findUnique({ where: { slug: args.slug }, select: { status: true, publishedAt: true } }),
      },
      async () => {
        const existing = await prisma.post.findUnique({
          where: { slug: args.slug },
          select: { id: true, publishedAt: true },
        });
        if (!existing) throw new Error(`Post not found: ${args.slug}`);
        const post = await prisma.post.update({
          where: { slug: args.slug },
          data: {
            status: args.published ? "published" : "draft",
            // Stamp publishedAt on first publish; keep it once set.
            ...(args.published && !existing.publishedAt ? { publishedAt: new Date() } : {}),
          },
        });
        return { slug: post.slug, status: post.status, publishedAt: post.publishedAt };
      },
    );
  },
});

export const postsTools = [listPosts, createPost, updatePost, publishPost];
