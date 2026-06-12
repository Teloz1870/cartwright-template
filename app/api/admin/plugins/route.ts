/**
 * /api/admin/plugins — plugin catalogue + install state (cartwright-plugin-v1).
 *
 *   GET  → { plugins: PluginState[] }   list every registered plugin with
 *          installed/enabled state (drives a future /admin/plugins UI and
 *          gives the `cartwright add` CLI an authoritative state probe).
 *   POST → { slug, action: "install" | "uninstall" }
 *          install  = materialise missing manifest files (inline contents
 *                     only) + enable the flag (audited, allowlisted — same
 *                     path as /admin/features).
 *          uninstall = disable the flag (files stay; flag-off is the
 *                     byte-identical storefront path).
 *
 * Auth: admin session only — same defense-in-depth pattern as
 * /api/admin/annotate (never trust a client gate).
 */
import { auth } from "@/lib/auth";
import { getPluginStates, installPlugin, uninstallPlugin } from "@/lib/plugins/install";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const plugins = await getPluginStates();
  return Response.json({ schema: "cartwright-plugin-v1", plugins });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { slug, action } = (body ?? {}) as { slug?: unknown; action?: unknown };
  if (typeof slug !== "string" || (action !== "install" && action !== "uninstall")) {
    return Response.json(
      { error: "Expected { slug: string, action: 'install' | 'uninstall' }" },
      { status: 400 },
    );
  }

  const actor = `user:${session.user.id}` as const;
  const result =
    action === "install" ? await installPlugin(slug, actor) : await uninstallPlugin(slug, actor);

  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json(result);
}
