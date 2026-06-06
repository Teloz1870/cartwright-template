import ResetPasswordForm from "./ResetPasswordForm";

export const metadata = { title: "Nulstil adgangskode" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="min-h-screen bg-black text-white selection:bg-white/30 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md relative z-10">
        <h1 className="text-4xl font-black text-white mb-8 text-center tracking-tighter">
          Nulstil adgangskode
        </h1>
        <div className="bg-[#0A0A0A] rounded-3xl shadow-2xl shadow-indigo-500/10 border border-white/10 px-8 py-10">
          <ResetPasswordForm token={token ?? ""} />
        </div>
      </div>
    </main>
  );
}
