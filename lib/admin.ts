import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * Server-side guard for admin pages.
 *
 * - No session  → redirect to /konto/login
 * - Non-admin   → redirect to / (customer homepage)
 * - Admin       → return the session (non-null, role === "admin")
 *
 * Because redirect() throws (never returns), TypeScript narrows the
 * return type correctly — the caller always gets a non-null session.
 */
export async function requireAdmin() {
  const session = await auth();

  if (!session) {
    redirect("/konto/login");
  }

  if (session.user.role !== "admin") {
    redirect("/");
  }

  return session;
}
