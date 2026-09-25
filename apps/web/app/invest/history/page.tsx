import Link from "next/link";
import { InvestmentHistory } from "@/components/investment-history";
import { ChevronLeftIcon } from "@/components/icons";

export default function InvestHistoryPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-10 pt-6">
      <header className="flex items-center justify-between">
        <Link href="/invest" className="inline-flex items-center gap-1 text-sm font-bold text-mist">
          <ChevronLeftIcon className="h-4 w-4" /> Invest
        </Link>
        <p className="text-sm font-extrabold tracking-[0.24em] text-soft">HISTORY</p>
        <span className="w-16" />
      </header>

      <h1 className="mt-6 text-xl font-bold tracking-tight text-soft">My Investments</h1>
      <p className="mt-1 text-sm text-mist">
        Your withdrawal wallet and active packages.
      </p>

      <div className="mt-6">
        <InvestmentHistory />
      </div>

      <footer className="mt-10 text-center">
        <p className="text-sm font-extrabold tracking-[0.32em] text-soft">COPINEX</p>
        <p className="mt-1.5 text-xs text-mist">Copy. Trade. Grow.</p>
      </footer>
    </main>
  );
}