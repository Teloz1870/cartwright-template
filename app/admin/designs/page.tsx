import { redirect } from "next/navigation";

/**
 * /admin/designs is folded into /admin/indstillinger as the "Designs" tab
 * (the Appearance hub). The route is kept as a redirect so bookmarks + CLI doc links
 * ("npx cartwright design import" points here) keep working.
 */
export default function AdminDesignsRedirect() {
  redirect("/admin/indstillinger?tab=designs");
}
