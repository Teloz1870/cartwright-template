/**
 * Re-export shim — the blog admin server actions moved to the blog plugin
 * (plugins/blog/admin/actions.ts, cartwright-plugin-v1). Keeps the historical
 * import path working unchanged for existing scaffolds.
 */
export {
  getPostsForAdmin,
  getPostForAdmin,
  savePost,
  deletePost,
} from "@/plugins/blog/admin/actions";
export type { BlogFormData, BlogActionResult } from "@/plugins/blog/admin/actions";
