import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ProfileForm from "./ProfileForm";
import PasswordForm from "./PasswordForm";

export const metadata = { title: "Kontoindstillinger" };

export default async function AccountSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/account/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      phoneNumber: true,
      shippingName: true,
      shippingAddress: true,
      shippingZip: true,
      shippingCity: true,
      passwordHash: true,
    },
  });
  if (!user) {
    redirect("/account/login");
  }

  return (
    <main className="min-h-screen bg-black text-white px-4 py-16">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-black tracking-tighter">Indstillinger</h1>
          <Link
            href="/account"
            className="text-sm font-bold text-indigo-400 transition-colors hover:text-indigo-300"
          >
            ← Min konto
          </Link>
        </div>

        <div className="mb-4 rounded-2xl border border-white/10 bg-[#0A0A0A] px-6 py-4 text-sm text-white/60">
          Email: <span className="font-bold text-white">{user.email}</span>
          <p className="mt-1 text-xs text-white/40">
            Email kan ikke ændres her — kontakt support hvis den skal skiftes.
          </p>
        </div>

        <section className="mb-6 rounded-3xl border border-white/10 bg-[#0A0A0A] px-6 py-8">
          <h2 className="mb-4 text-lg font-black">Profil &amp; levering</h2>
          <ProfileForm
            initial={{
              name: user.name ?? "",
              phoneNumber: user.phoneNumber ?? "",
              shippingName: user.shippingName ?? "",
              shippingAddress: user.shippingAddress ?? "",
              shippingZip: user.shippingZip ?? "",
              shippingCity: user.shippingCity ?? "",
            }}
          />
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#0A0A0A] px-6 py-8">
          <h2 className="mb-1 text-lg font-black">Adgangskode</h2>
          <p className="mb-4 text-sm text-white/50">
            {user.passwordHash
              ? "Skift din adgangskode (mindst 8 tegn)."
              : "Opret en adgangskode, så du kan logge ind uden magic-link."}
          </p>
          <PasswordForm hasPassword={Boolean(user.passwordHash)} />
        </section>
      </div>
    </main>
  );
}
