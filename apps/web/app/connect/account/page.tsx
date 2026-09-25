import Link from "next/link";
import { ChevronLeftIcon } from "@/components/icons";
import { ConnectForm } from "@/components/connect-form";

export default function ConnectAccountPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-10 pt-6">
      {/* Header */}
      <header className="flex items-center gap-3">
        <Link
          href="/connect/steps"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-soft transition hover:bg-white/10"
          aria-label="Back to onboarding guide"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold tracking-tight text-soft">Connect Account</h1>
      </header>

      {/* Fee notice */}
      <p className="mt-5 rounded-2xl border border-green/20 bg-green/10 px-4 py-3 text-sm leading-relaxed text-soft">
        <span className="font-semibold text-green">$1 processing fee</span> will be
        charged from your Copinex wallet.
      </p>

      {/* Form */}
      <section className="mt-6">
        <h2 className="text-[15px] font-bold text-soft">Link Your Account</h2>
        <p className="mt-1 text-sm text-mist">
          Enter the exact details from your PUPRIME account.
        </p>
        <ConnectForm />
      </section>
    </main>
  );
}