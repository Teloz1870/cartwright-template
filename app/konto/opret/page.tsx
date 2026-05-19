import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import RegisterForm from "@/components/RegisterForm";

export default async function OpretKontoPage() {
  const session = await auth();
  if (session) {
    redirect("/konto");
  }

  return (
    <main className="min-h-screen bg-sol-cream px-4 py-16">
      <div className="mx-auto max-w-md">
        <h1 className="mb-8 text-4xl font-black text-sol-ink">Opret konto</h1>
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <RegisterForm />
        </div>
        <p className="mt-6 text-center text-sm text-sol-muted">
          Har du allerede en konto?{" "}
          <Link
            href="/konto/login"
            className="font-bold text-sol-accent hover:underline"
          >
            Log ind
          </Link>
        </p>
      </div>
    </main>
  );
}
