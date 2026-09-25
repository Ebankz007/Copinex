import Link from "next/link";
import {
  ArrowUpRightIcon,
  ChartIcon,
  CompassIcon,
  CopyTradeIcon,
  LandmarkIcon,
  LayersIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrophyIcon,
  UsersIcon,
} from "@/components/icons";
import { WithdrawalWalletCard } from "@/components/withdrawal-wallet-card";

const TILES = [
  { label: "Rewards", icon: TrophyIcon, href: "#" },
  { label: "Explore Copinex", icon: CompassIcon, href: "#" },
  { label: "Pools", icon: LayersIcon, href: "/invest" },
  { label: "Brokers", icon: LandmarkIcon, href: "#" },
  { label: "Network", icon: UsersIcon, href: "#" },
  { label: "Performance", icon: ChartIcon, href: "#" },
];

export default function DashboardPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-10 pt-6">
      {/* Header */}
      <header className="flex items-start justify-between">
        <div>
          <p className="text-sm text-mist">Welcome back,</p>
          <h1 className="mt-0.5 text-xl font-bold tracking-tight text-soft">
            Forex GrandMaster
          </h1>
          <span className="mt-1.5 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-mist">
            ID: TP682923
          </span>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-green to-teal-2 text-sm font-bold text-night">
          FG
        </div>
      </header>

      {/* Balance card */}
      <section className="mt-6 rounded-3xl border border-white/10 bg-gradient-to-b from-navy-2 to-navy p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist">
          Total Balance (USDT)
        </p>
        <p className="mt-2 text-[2.6rem] font-bold leading-none tracking-tight text-soft">
          $15.50
        </p>
        <p className="mt-3 text-xs text-mist">No earnings yet today</p>
      </section>

      {/* Withdrawal wallet (investment profits) */}
      <WithdrawalWalletCard />

      {/* Deposit / Withdraw */}
      <section className="mt-4 grid grid-cols-2 gap-3">
        <Link
          href="#"
          className="flex items-center justify-center gap-2 rounded-2xl bg-green py-3.5 text-sm font-bold text-night transition hover:brightness-110 active:scale-[0.99]"
        >
          <PlusIcon className="h-4 w-4" />
          Deposit
        </Link>
        <Link
          href="#"
          className="flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 py-3.5 text-sm font-bold text-soft transition hover:bg-white/10 active:scale-[0.99]"
        >
          <ArrowUpRightIcon className="h-4 w-4" />
          Withdraw
        </Link>
      </section>

      {/* Account status */}
      <section className="mt-4 rounded-3xl border border-white/10 bg-navy p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist">
          Account Status
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-green shadow-[0_0_10px_rgba(102,211,19,0.8)]" />
          <p className="text-[15px] font-bold text-soft">Active</p>
        </div>
        <p className="mt-1 text-sm text-mist">You have full access to all features.</p>
      </section>

      {/* Copy Trade CTA */}
      <Link
        href="/connect"
        className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-green py-3.5 text-[15px] font-bold text-night transition hover:brightness-110 active:scale-[0.99]"
      >
        <CopyTradeIcon className="h-5 w-5" />
        Copy Trade
      </Link>

      {/* Feature tiles */}
      <section className="mt-6 grid grid-cols-3 gap-3">
        {TILES.map(({ label, icon: Icon, href }) => (
          <Link
            key={label}
            href={href}
            className="flex flex-col items-center gap-2.5 rounded-2xl border border-white/5 bg-navy px-2 py-4 transition hover:border-green/30 hover:bg-navy-2"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-green/10 text-green">
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-center text-[11px] font-medium leading-tight text-mist">
              {label}
            </span>
          </Link>
        ))}
      </section>

      {/* Footer */}
      <footer className="mt-9 text-center">
        <p className="text-sm font-extrabold tracking-[0.32em] text-soft">COPINEX</p>
        <p className="mt-1.5 text-xs text-mist">Copy. Trade. Grow.</p>
      </footer>
    </main>
  );
}