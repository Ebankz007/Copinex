import Link from "next/link";
import { WalletCenter } from "@/components/wallet-center";
import { ChevronLeftIcon } from "@/components/icons";

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab = tab === "deposit" || tab === "withdraw" ? tab : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-10 pt-6">
      <header className="flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-1 text-sm font-bold text-mist">
          <ChevronLeftIcon className="h-4 w-4" /> Dashboard
        </Link>
        <p className="text-sm font-extrabold tracking-[0.24em] text-soft">WALLET</p>
        <span className="w-16" />
      </header>

      <h1 className="mt-6 text-xl font-bold tracking-tight text-soft">Wallet & Transactions</h1>
      <p className="mt-1 text-sm text-mist">
        Deposit USDT, withdraw profits, and track every movement.
      </p>

      <div className="mt-6">
        <WalletCenter initialTab={initialTab} />
      </div>

      <footer className="mt-10 text-center">
        <p className="text-sm font-extrabold tracking-[0.32em] text-soft">COPINEX</p>
        <p className="mt-1.5 text-xs text-mist">Copy. Trade. Grow.</p>
      </footer>
    </main>
  );
}