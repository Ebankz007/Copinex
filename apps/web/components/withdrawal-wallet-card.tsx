"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchWallet, isDemoMode, type WalletSummary } from "@/lib/api";
import { formatCents } from "@/lib/format";
import { WalletIcon } from "@/components/icons";

/** Dashboard card: Withdrawal Wallet (available vs locked). */
export function WithdrawalWalletCard() {
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDemo(isDemoMode());
    fetchWallet()
      .then((w) => {
        if (!cancelled) setWallet(w);
      })
      .catch(() => {
        if (!cancelled) setWallet({ availableCents: 0, lockedCents: 0, totalCents: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mt-4 rounded-3xl border border-white/10 bg-navy p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist">
          Withdrawal Wallet
        </p>
        <WalletIcon className="h-4 w-4 text-green" />
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-soft">
        {wallet ? formatCents(wallet.totalCents) : "…"}
      </p>
      <div className="mt-3 flex items-center gap-4 text-xs">
        <span className="text-mist">
          Available{" "}
          <span className="font-bold text-green">
            {wallet ? formatCents(wallet.availableCents) : "…"}
          </span>
        </span>
        <span className="text-mist">
          Locked{" "}
          <span className="font-bold text-soft">
            {wallet ? formatCents(wallet.lockedCents) : "…"}
          </span>
        </span>
        {demo && (
          <span className="ml-auto rounded-full bg-amber-400/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
            Demo
          </span>
        )}
      </div>
      <Link
        href="/invest"
        className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-green"
      >
        Invest & earn daily →
      </Link>
    </section>
  );
}