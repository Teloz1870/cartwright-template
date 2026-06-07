import { redirect } from "next/navigation";

/**
 * /admin/designs er foldet ind i /admin/indstillinger som "Designs"-tab
 * (Udseende-hub). Ruten bevares som redirect så bookmarks + CLI-doc-links
 * ("npx cartwright design import" peger her) fortsat virker.
 */
export default function AdminDesignsRedirect() {
  redirect("/admin/indstillinger?tab=designs");
}
