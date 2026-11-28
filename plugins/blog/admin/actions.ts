"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { scheduleIndexNowPing } from "@/lib/indexnow";

/**
 * Admin-server-actions for bloggen. Spejler /admin/sider (pages)-mønstret.
 */

export type BlogFormData = {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  coverImage: string;
  author: string;
  status: "draft" | "published";
  tags: string; // komma-separeret i UI
  metaTitle: string;
  metaDescription: string;
};

export type BlogActionResult =
  | { ok: true; id: string; slug: string }
  | { ok: false; error: string };

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[æ]/g, "ae")
    .replace(/[ø]/g, "oe")
    .replace(/[å]/g, "aa")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function tagsToJson(raw: string): string | null {
  const arr = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return arr.length ? JSON.stringify(arr) : null;
}

export async function getPostsForAdmin() {
  await requireAdmin();
  return prisma.post.findMany({
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    select: { id: true, slug: true, title: true, status: true, publishedAt: true, updatedAt: true },
  });
}

export async function getPostForAdmin(id: string) {
  await requireAdmin();
  return prisma.post.findUnique({ where: { id } });
}

export async function savePost(data: BlogFormData): Promise<BlogActionResult> {
  await requireAdmin();
  const title = data.title.trim();
  if (!title) return { ok: false, error: "Title is required." };
  const slug = (data.slug.trim() ? slugify(data.slug) : slugify(title)) || `post-${Date.now()}`;
  if (!data.body.trim()) return { ok: false, error: "Content is required." };

  const base = {
    title,
    slug,
    excerpt: data.excerpt.trim() || null,
    body: data.body,
    coverImage: data.coverImage.trim() || null,
    author: data.author.trim() || null,
    status: data.status,
    tags: tagsToJson(data.tags),
    metaTitle: data.metaTitle.trim() || null,
    metaDescription: data.metaDescription.trim() || null,
  };

  try {
    let saved;
    // The editor can rename and unpublish: the URL public before this save
    // is pinged as well as the one public after it.
    let existing: { slug: string; status: string; publishedAt: Date | null } | null = null;
    if (data.id) {
      existing = await prisma.post.findUnique({
        where: { id: data.id },
        select: { slug: true, status: true, publishedAt: true },
      });
      // Sæt publishedAt første gang status bliver published.
      const publishedAt =
        data.status === "published" ? existing?.publishedAt ?? new Date() : existing?.publishedAt ?? null;
      saved = await prisma.post.update({
        where: { id: data.id },
        data: { ...base, publishedAt },
      });
    } else {
      saved = await prisma.post.create({
        data: { ...base, publishedAt: data.status === "published" ? new Date() : null },
      });
    }
    revalidatePath("/admin/blog");
    revalidatePath("/blog", "layout");
    scheduleIndexNowPing({
      kind: "post",
      oldSlug: existing?.slug,
      newSlug: saved.slug,
      wasPublic: existing?.status === "published",
      isPublic: saved.status === "published",
    });
    return { ok: true, id: saved.id, slug: saved.slug };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not save post.";
    return { ok: false, error: msg.includes("Unique") ? "Slug is already in use." : msg };
  }
}

export async function deletePost(id: string): Promise<{ ok: boolean }> {
  await requireAdmin();
  const removed = await prisma.post.delete({ where: { id } });
  revalidatePath("/admin/blog");
  revalidatePath("/blog", "layout");
  scheduleIndexNowPing({ kind: "post", oldSlug: removed.slug, wasPublic: removed.status === "published", isPublic: false });
  return { ok: true };
}
