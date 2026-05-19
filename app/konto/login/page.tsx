import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

export default async function LoginPage() {
  const session = await auth();
  if (session) {
    redirect("/konto");
  }

  return (
    <main className="min-h-screen bg-sol-cream flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-black text-sol-ink mb-8 text-center">
          Log ind
        </h1>

        <div className="bg-white rounded-3xl shadow-sm border border-sol-ink/10 px-8 py-10">
          <Suspense fallback={<p className="text-sol-muted text-sm">Indlæser…</p>}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-sm text-sol-muted">
          Ingen konto?{" "}
          <Link
            href="/konto/opret"
            className="font-bold text-sol-accent hover:underline"
          >
            Opret en
          </Link>
        </p>
      </div>
    </main>
  );
}
