import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import RegisterForm from "@/components/RegisterForm";

export default async function OpretKontoPage() {
  const session = await auth();
  if (session) {
    if (session.user.role === "admin") {
      redirect("/admin");
    } else {
      redirect("/account");
    }
  }

  return (
    <main className="min-h-screen bg-black text-white selection:bg-white/30 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md relative z-10">
        <h1 className="text-4xl font-black text-white mb-8 text-center tracking-tighter">
          Create account
        </h1>
        <div className="bg-[#0A0A0A] rounded-3xl shadow-2xl shadow-indigo-500/10 border border-white/10 px-8 py-10">
          <RegisterForm />
        </div>
        <p className="mt-6 text-center text-sm text-white/50">
          Already have an account?{" "}
          <Link
            href="/account/login"
            className="font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
