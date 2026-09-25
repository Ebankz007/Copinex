import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export const metadata = {
  title: "Register — Copinex",
};

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-10 pt-12">
      <Link href="/" className="text-center">
        <p className="text-2xl font-extrabold tracking-[0.32em] text-soft">COPINEX</p>
      </Link>
      <h1 className="mt-8 text-xl font-bold tracking-tight text-soft">Create your account</h1>
      <p className="mt-1 text-sm text-mist">
        Join Copinex and start earning daily investment returns.
      </p>

      <div className="mt-6">
        <AuthForm mode="register" />
      </div>

      <footer className="mt-10 text-center">
        <p className="text-xs text-mist">Copy. Trade. Grow.</p>
      </footer>
    </main>
  );
}