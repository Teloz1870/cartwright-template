import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/brand";
import { displayFont } from "@/components/surfaces/DesignSurface";
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

  // Mixer 2.0 Phase 4 — designSurfaces: the page surface adopts the active
  // palette; the cards stay dark (white-text Profile/Password forms inside)
  // and get an explicit text-white so they no longer rely on the page shell's
  // color. Flag OFF (default) → exact legacy classes (byte-identical).
  const designSurfaces =
    Boolean((await getBrand().catch(() => null))?.features.designSurfaces);
  const mainClass = designSurfaces
    ? "min-h-screen bg-sol-cream text-sol-ink px-4 py-16"
    : "min-h-screen bg-black text-white px-4 py-16";
  const backLinkClass = designSurfaces
    ? "text-sm font-bold text-sol-accent transition-colors hover:underline"
    : "text-sm font-bold text-indigo-400 transition-colors hover:text-indigo-300";
  const infoCardClass = designSurfaces
    ? "mb-4 rounded-2xl border border-sol-ink/15 bg-[#0A0A0A] px-6 py-4 text-sm text-white/60"
    : "mb-4 rounded-2xl border border-white/10 bg-[#0A0A0A] px-6 py-4 text-sm text-white/60";
  const sectionClass = designSurfaces
    ? "rounded-3xl border border-sol-ink/15 bg-[#0A0A0A] px-6 py-8 text-white"
    : "rounded-3xl border border-white/10 bg-[#0A0A0A] px-6 py-8";

  return (
    <main className={mainClass} {...(designSurfaces ? { "data-design-surface": true } : {})}>
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <h1
            className="text-3xl font-black tracking-tighter"
            {...(designSurfaces ? { style: displayFont } : {})}
          >
            Indstillinger
          </h1>
          <Link
            href="/account"
            className={backLinkClass}
          >
            ← Min konto
          </Link>
        </div>

        <div className={infoCardClass}>
          Email: <span className="font-bold text-white">{user.email}</span>
          <p className="mt-1 text-xs text-white/40">
            Email kan ikke ændres her — kontakt support hvis den skal skiftes.
          </p>
        </div>

        <section className={`mb-6 ${sectionClass}`}>
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

        <section className={sectionClass}>
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
