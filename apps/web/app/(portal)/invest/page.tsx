import Link from "next/link";
import { InvestmentCenter } from "@/components/investment-center";
import { ChevronLeftIcon } from "@/components/icons";

export default function InvestPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 pb-10 pt-6 sm:max-w-xl sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8 xl:max-w-7xl">
      <header className="flex items-center justify-between">
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm font-bold text-mist">
          <ChevronLeftIcon className="h-4 w-4" /> Dashboard
        </Link>
        <p className="text-sm font-extrabold tracking-[0.24em] text-soft">INVEST</p>
        <span className="w-16" />
      </header>

      <h1 className="mt-6 text-xl font-bold tracking-tight text-soft">90-Day Investment Packages</h1>
      <p className="mt-1 text-sm text-mist">
        Pick a tier, start an investment, and earn daily from day one.
      </p>

      <div className="mt-6">
        <InvestmentCenter />
      </div>

      <footer className="mt-10 text-center">
        <p className="text-sm font-extrabold tracking-[0.32em] text-soft">COPINEX</p>
        <p className="mt-1.5 text-xs text-mist">Copy. Trade. Grow.</p>
      </footer>
    </main>
  );
}
