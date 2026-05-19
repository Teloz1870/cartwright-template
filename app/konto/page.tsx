import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Button } from "@/components/Button";
import LogoutButton from "@/components/LogoutButton";

export default async function KontoPage() {
  const session = await auth();
  if (!session) {
    redirect("/konto/login");
  }

  return (
    <main className="min-h-screen bg-sol-cream flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-black text-sol-ink mb-8 text-center">
          Min konto
        </h1>

        <div className="bg-white rounded-3xl shadow-sm border border-sol-ink/10 px-8 py-10 flex flex-col gap-6">
          <div>
            {session.user.name && (
              <p className="text-lg font-black text-sol-ink">
                {session.user.name}
              </p>
            )}
            {session.user.email && (
              <p className="text-sm text-sol-muted">{session.user.email}</p>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <Button href="/konto/ordrer" variant="primary">
              Se mine ordrer
            </Button>
            {/* Admin-shortcut: kun synlig for admin-users. Backend er kun
                tilgængelig via direkte URL ellers — denne link er bro fra
                kunde-konto til admin-dashboard så man ikke skal huske /admin. */}
            {session.user.role === "admin" && (
              <Button href="/admin" variant="dark">
                🔐 Admin-dashboard
              </Button>
            )}
            <LogoutButton />
          </div>
        </div>
      </div>
    </main>
  );
}
