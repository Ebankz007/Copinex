"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AVAILABLE_AFTER_DAYS } from "@copinex/engine";
import {
  fetchInvestments,
  fetchWallet,
  isDemoMode,
  type InvestmentDto,
  type WalletSummary,
} from "@/lib/api";
import { formatCents, formatDate } from "@/lib/format";
import { ChevronLeftIcon } from "@/components/icons";

export function InvestmentHistory() {
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [investments, setInvestments] = useState<InvestmentDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const demo = isDemoMode();

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchWallet(), fetchInvestments()])
      .then(([w, invs]) => {
        if (cancelled) return;
        setWallet(w);
        setInvestments(invs);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load your investments");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="mt-10 rounded-3xl border border-white/10 bg-navy p-6 text-center">
        <p className="text-sm text-mist">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-2xl bg-green px-6 py-2.5 text-sm font-bold text-night"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {demo && (
        <p className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-xs text-amber-300">
          Demo mode — sample data computed with the same engine the backend uses.
        </p>
      )}

      {/* Withdrawal wallet */}
      <section className="rounded-3xl border border-white/10 bg-gradient-to-b from-navy-2 to-navy p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist">
          Withdrawal Wallet
        </p>
        <p className="mt-2 text-[2.2rem] font-bold leading-none tracking-tight text-soft">
          {wallet ? formatCents(wallet.totalCents) : "…"}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-green/10 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-mist">Available</p>
            <p className="mt-1 text-sm font-bold text-green">
              {wallet ? formatCents(wallet.availableCents) : "…"}
            </p>
          </div>
          <div className="rounded-2xl bg-white/5 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-mist">Locked</p>
            <p className="mt-1 text-sm font-bold text-soft">
              {wallet ? formatCents(wallet.lockedCents) : "…"}
            </p>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-mist">
          Locked profit unlocks {formatDate(new Date(Date.now() + AVAILABLE_AFTER_DAYS * 86400000))} at the latest.
        </p>
      </section>

      {/* Investments */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist">
          My investments
        </p>
        {investments.length === 0 ? (
          <div className="mt-3 rounded-3xl border border-dashed border-white/15 bg-navy p-8 text-center">
            <p className="text-sm text-mist">No investments yet.</p>
            <Link href="/invest" className="mt-3 inline-block text-sm font-bold text-green">
              Start investing →
            </Link>
          </div>
        ) : (
          <div className="mt-3 space-y-2.5">
            {investments.map(({ investment, package: pkg, summary }) => {
              const elapsed = Math.max(
                0,
                Math.min(90, Math.floor((Date.now() - new Date(investment.startDate).getTime()) / 86400000)),
              );
              return (
                <div key={investment.id} className="rounded-2xl border border-white/10 bg-navy p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-soft">{pkg.name}</p>
                      <p className="mt-0.5 text-[11px] text-mist">
                        {formatCents(investment.principalCents)} · started {formatDate(investment.startDate)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        investment.status === "ACTIVE"
                          ? "bg-green/15 text-green"
                          : investment.status === "MATURED"
                            ? "bg-blue/20 text-blue-300"
                            : "bg-white/10 text-mist"
                      }`}
                    >
                      {investment.status}
                    </span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-green" style={{ width: `${elapsed}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-mist">
                    <span>
                      Day {elapsed} / 90 accrual
                    </span>
                    <span>
                      Earned <span className="font-bold text-soft">{formatCents(summary.totalEarnedCents)}</span> ·{" "}
                      Available <span className="font-bold text-green">{formatCents(summary.availableCents)}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Link href="/invest" className="inline-flex items-center gap-1 text-xs font-bold text-mist">
        <ChevronLeftIcon className="h-3.5 w-3.5" /> Back to investing
      </Link>
    </div>
  );
}