"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRightIcon,
  BellIcon,
  ChartIcon,
  CompassIcon,
  CopyTradeIcon,
  HomeIcon,
  LandmarkIcon,
  LayersIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrophyIcon,
  UserIcon,
  UsersIcon,
} from "@/components/icons";
import { DashboardHeader } from "@/components/dashboard-header";
import { WithdrawalWalletCard } from "@/components/withdrawal-wallet-card";
import {
  fetchMe,
  fetchWalletBalances,
  isAdminRole,
  isDemoMode,
  type UserDto,
  type WalletBalances,
} from "@/lib/api";
import { formatCents } from "@/lib/format";

const MEMBER_TILES = [
  { label: "Rewards", icon: TrophyIcon, href: "/wallet" },
  { label: "Explore Copinex", icon: CompassIcon, href: "/invest" },
  { label: "Pools", icon: LayersIcon, href: "/invest" },
  { label: "Brokers", icon: LandmarkIcon, href: "/connect" },
  { label: "Network", icon: UsersIcon, href: "/network" },
  { label: "Performance", icon: ChartIcon, href: "/invest/history" },
  { label: "Notifications", icon: BellIcon, href: "/notifications" },
  { label: "Profile", icon: UserIcon, href: "/profile" },
  { label: "Home", icon: HomeIcon, href: "/dashboard" },
];

/**
 * Landing dashboard. Shows the real member's balance and activation status
 * when a session exists; otherwise the demo persona (clearly badged).
 */
export function DashboardCenter() {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDemo(isDemoMode());
    fetchMe().then((u) => {
      if (cancelled) return;
      setUser(u);
      setLoaded(true);
      if (u) {
        fetchWalletBalances()
          .then((b) => {
            if (!cancelled) setBalances(b);
          })
          .catch(() => {
            if (!cancelled) setBalances(null);
          });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const totalCents =
    balances === null
      ? null
      : balances.wallets.reduce((sum, w) => sum + w.balanceCents, 0);

  const activated = user?.membershipActivated ?? false;

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-10 pt-6 sm:max-w-xl sm:px-6 lg:max-w-6xl lg:px-8 xl:max-w-7xl">
      {/* Header */}
      <DashboardHeader />

      {/* Two-column body from lg: primary actions on the left, wallet/CTA rail
          on the right. Stacks to a single column on phones. */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3 lg:items-start">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {/* Balance card */}
          <section className="rounded-3xl border border-white/10 bg-gradient-to-b from-navy-2 to-navy p-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist">
            Total Balance (USDT)
          </p>
          {demo && (
            <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
              Demo
            </span>
          )}
        </div>
        <p className="mt-2 text-[2.6rem] font-bold leading-none tracking-tight text-soft">
          {totalCents === null ? "$15.50" : formatCents(totalCents)}
        </p>
        {loaded && user ? (
          <p className="mt-3 text-xs text-mist">
            {balances && balances.pendingHoldsCents > 0
              ? `${formatCents(balances.pendingHoldsCents)} held for pending withdrawals`
              : activated
                ? "Available to withdraw · invest · copy trade"
                : "Activate your membership to unlock withdrawals, investments & PAMM"}
          </p>
        ) : (
          <p className="mt-3 text-xs text-mist">No earnings yet today</p>
        )}
          </section>

          {/* Deposit / Withdraw */}
          <section className="grid grid-cols-2 gap-3">
            <Link
              href="/wallet?tab=deposit"
              className="flex items-center justify-center gap-2 rounded-2xl bg-green py-3.5 text-sm font-bold text-night transition hover:brightness-110 active:scale-[0.99]"
            >
              <PlusIcon className="h-4 w-4" />
              Deposit
            </Link>
            <Link
              href="/wallet?tab=withdraw"
              className="flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 py-3.5 text-sm font-bold text-soft transition hover:bg-white/10 active:scale-[0.99]"
            >
              <ArrowUpRightIcon className="h-4 w-4" />
              Withdraw
            </Link>
          </section>

          {/* Account status */}
          <section className="rounded-3xl border border-white/10 bg-navy p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist">
              Account Status
            </p>
            <div className="mt-3 flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  !loaded || !user || activated
                    ? "bg-green shadow-[0_0_10px_rgba(102,211,19,0.8)]"
                    : "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.8)]"
                }`}
              />
              <p className="text-[15px] font-bold text-soft">
                {!loaded || !user ? "Active" : activated ? "Active" : "Activation pending"}
              </p>
            </div>
            <p className="mt-1 text-sm text-mist">
              {!loaded || !user
                ? "You have full access to all features."
                : activated
                  ? "You have full access to all features."
                  : "You are earning commissions — pay the $50 fee to unlock withdrawals, investments & PAMM."}
            </p>
          </section>
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-4">
          {/* Withdrawal wallet (investment profits) */}
          <WithdrawalWalletCard />

          {/* Copy Trade CTA */}
          <Link
            href="/connect"
            className="flex items-center justify-center gap-2 rounded-2xl bg-green py-3.5 text-[15px] font-bold text-night transition hover:brightness-110 active:scale-[0.99]"
          >
            <CopyTradeIcon className="h-5 w-5" />
            Copy Trade
          </Link>

          {/* Admin console */}
          {loaded && isAdminRole(user?.role) && (
            <Link
              href="/admin"
              className="flex items-center justify-center gap-2 rounded-2xl border border-green/30 bg-green/10 py-3.5 text-[15px] font-bold text-green transition hover:bg-green/15 active:scale-[0.99]"
            >
              <ShieldCheckIcon className="h-5 w-5" />
              {user?.role === "SUPERADMIN" ? "Superadmin Console" : "Admin Console"}
            </Link>
          )}
        </div>
      </div>

      {/* Feature tiles */}
      <section className="mt-6 grid grid-cols-3 gap-3 lg:grid-cols-5">
        {MEMBER_TILES.map(({ label, icon: Icon, href }) => (
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