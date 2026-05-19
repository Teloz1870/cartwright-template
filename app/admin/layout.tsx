import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import {
  isSetupWhitelistedPath,
  shouldShowSetupWizard,
} from "@/lib/setup-wizard";
import AdminChatLauncher from "@/components/admin/AdminChatLauncher";
import AdminNavLink from "@/components/admin/AdminNavLink";
import SetupWarningBar from "@/components/admin/SetupWarningBar";

const navLinks = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/produkter", label: "Produkter" },
  { href: "/admin/sider", label: "Sider" },
  { href: "/admin/kategorier", label: "Kategorier" },
  { href: "/admin/ordrer", label: "Ordrer" },
  { href: "/admin/rabatkoder", label: "Rabatkoder" },
  { href: "/admin/kunder", label: "Kunder" },
  { href: "/admin/mails", label: "Mails" },
  { href: "/admin/api-keys", label: "API-keys" },
  { href: "/admin/integrations", label: "Integrationer" },
  { href: "/admin/audit", label: "Audit-log" },
  { href: "/admin/ai", label: "AI-copilot" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  // Task D: redirect til /admin/setup hvis fresh fork (ingen produkter +
  // setupComplete=false). Whitelister /admin/setup (selvfølgelig) og
  // /admin/integrations så power-user altid kan nå keys-siden direkte.
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (pathname && !isSetupWhitelistedPath(pathname)) {
    if (await shouldShowSetupWizard()) {
      redirect("/admin/setup");
    }
  }

  return (
    <div className="min-h-screen bg-sol-cream text-sol-ink md:flex">
      {/* Phase 8 Task C: admin sidebar nu i sol-accent-deep (matcher Footer-paletten
          fra Phase 6). border-r med subtle glass-border for premium-edge frem for
          hård sol-ink/white-divider. */}
      <aside className="hidden w-56 shrink-0 border-r border-sol-glass-border bg-sol-accent-deep text-white md:flex md:min-h-screen md:flex-col">
        <div className="border-b border-white/10 px-5 py-5">
          <Link href="/admin" className="text-xl font-black">
            Admin
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {navLinks.map((link) => (
            <AdminNavLink key={link.href} href={link.href} label={link.label} />
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <Link
            href="/"
            className="block rounded-lg px-3 py-2 text-sm font-bold text-white/85 transition hover:bg-white/10 hover:text-white"
          >
            Til butikken
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <SetupWarningBar />

        {/* Phase 8 Task C: mobile admin-header matcher sidebar (sol-accent-deep) */}
        <div className="bg-sol-accent-deep px-4 py-3 text-white md:hidden">
          <div className="mb-3 flex items-center justify-between gap-4">
            <Link href="/admin" className="text-lg font-black">
              Admin
            </Link>
            <Link href="/" className="text-sm font-bold text-white/85">
              Til butikken
            </Link>
          </div>

          <nav className="-mx-1 flex gap-1 overflow-x-auto">
            {navLinks.map((link) => (
              <AdminNavLink key={link.href} href={link.href} label={link.label} mobile />
            ))}
          </nav>
        </div>

        <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>

      {/* Global ⌘K-launcher — fixed positioned, vises på alle /admin/* sider */}
      <AdminChatLauncher />
    </div>
  );
}
