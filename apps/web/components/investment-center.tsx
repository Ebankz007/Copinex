"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AVAILABLE_AFTER_DAYS,
  DAILY_ACCRUAL_DAYS,
  UPLINE_COMMISSION_RATE_BPS,
  addDays,
  computeDailyProfitCents,
  computeMonthlyProfitCents,
  getPackageForAmount,
} from "@copinex/engine";
import {
  ApiError,
  fetchPackages,
  isDemoMode,
  startInvestment,
  type PackageDto,
} from "@/lib/api";
import { formatBps, formatCents, formatDate } from "@/lib/format";
import { ChevronLeftIcon, ChevronRightIcon, ShieldCheckIcon, WalletIcon } from "@/components/icons";

type Phase = "loading" | "ready" | "error";

export function InvestmentCenter() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [packages, setPackages] = useState<PackageDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amountText, setAmountText] = useState("100");
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ principalCents: number; availableDate: string } | null>(null);

  const demo = isDemoMode();

  useEffect(() => {
    let cancelled = false;
    fetchPackages()
      .then((pkgs) => {
        if (cancelled) return;
        setPackages(pkgs);
        setPhase("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof ApiError ? e.message : "Could not load packages");
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const amountCents = useMemo(() => {
    const n = Number(amountText);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100);
  }, [amountText]);

  const selected = useMemo(() => getPackageForAmount(amountCents), [amountCents]);

  const projection = useMemo(() => {
    if (!selected || amountCents <= 0) return null;
    const daily = computeDailyProfitCents(amountCents, selected.dailyRateBps);
    const monthly = computeMonthlyProfitCents(amountCents, selected.monthlyRateBps);
    const now = new Date();
    return {
      daily,
      monthly,
      ninetyDayTotal: daily * DAILY_ACCRUAL_DAYS,
      availableDate: addDays(now, AVAILABLE_AFTER_DAYS),
      uplineShare: Math.floor((monthly * UPLINE_COMMISSION_RATE_BPS) / 10_000),
    };
  }, [selected, amountCents]);

  async function handleInvest() {
    if (!selected || amountCents < selected.minAmountCents) {
      setError(`Minimum investment is $50`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await startInvestment(amountCents);
      setCreated({
        principalCents: result.investment.principalCents,
        availableDate: result.investment.availableDate,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Investment failed — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === "loading") {
    return <p className="mt-10 text-center text-sm text-mist">Loading investment packages…</p>;
  }

  if (phase === "error") {
    return (
      <div className="mt-10 rounded-3xl border border-white/10 bg-navy p-6 text-center">
        <p className="text-sm text-mist">{loadError}</p>
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
      {/* Demo badge */}
      {demo && (
        <p className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-xs text-amber-300">
          Demo mode — no account session. Projections are computed with the same engine the
          backend uses.{" "}
          <Link href="/login" className="font-bold text-amber-200 underline underline-offset-2">
            Sign in
          </Link>{" "}
          to invest with real funds.
        </p>
      )}

      {/* Calculator */}
      <section className="rounded-3xl border border-white/10 bg-gradient-to-b from-navy-2 to-navy p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist">
          Investment amount
        </p>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-green">$</span>
          <input
            type="number"
            inputMode="decimal"
            min={50}
            step={1}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            className="w-full bg-transparent text-[2.4rem] font-bold leading-none tracking-tight text-soft outline-none placeholder:text-muted"
            placeholder="100"
            aria-label="Investment amount in USD"
          />
        </div>

        {projection && selected && (
          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-white/5 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-mist">Daily</p>
              <p className="mt-1 text-sm font-bold text-soft">{formatCents(projection.daily)}</p>
            </div>
            <div className="rounded-2xl bg-white/5 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-mist">Monthly</p>
              <p className="mt-1 text-sm font-bold text-soft">{formatCents(projection.monthly)}</p>
            </div>
            <div className="rounded-2xl bg-white/5 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-mist">90 days</p>
              <p className="mt-1 text-sm font-bold text-green">{formatCents(projection.ninetyDayTotal)}</p>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-1.5 text-xs text-mist">
          <p>
            · Daily profit accumulates in your <span className="font-semibold text-soft">Withdrawal Wallet</span>{" "}
            and unlocks after <span className="font-semibold text-soft">{AVAILABLE_AFTER_DAYS} days</span>.
          </p>
          <p>
            · After {AVAILABLE_AFTER_DAYS} days, profit continues at your monthly rate — capital stays active.
          </p>
          {projection && (
            <p>
              · An additional{" "}
              <span className="font-semibold text-soft">
                {formatBps(UPLINE_COMMISSION_RATE_BPS)}
              </span>{" "}
              of your monthly profit is shared with your upline network.
            </p>
          )}
        </div>

        <button
          onClick={handleInvest}
          disabled={submitting || !selected}
          className="mt-5 w-full rounded-2xl bg-green py-3.5 text-[15px] font-bold text-night transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Processing…" : "Start Investment"}
        </button>
        {error && <p className="mt-3 text-center text-xs font-medium text-red-400">{error}</p>}
      </section>

      {/* Success */}
      {created && (
        <section className="rounded-3xl border border-green/30 bg-green/10 p-5">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="h-5 w-5 text-green" />
            <p className="text-sm font-bold text-soft">Investment started</p>
          </div>
          <p className="mt-2 text-xs text-mist">
            {formatCents(created.principalCents)} invested. Daily profit accrues immediately and
            becomes withdrawable on <span className="font-semibold text-soft">{formatDate(created.availableDate)}</span>.
          </p>
          <Link
            href="/invest/history"
            className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-green"
          >
            View my investments <ChevronRightIcon className="h-3.5 w-3.5" />
          </Link>
        </section>
      )}

      {/* Tiers */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist">
          Packages
        </p>
        <div className="mt-3 space-y-2.5">
          {packages.map((p) => {
            const active = selected?.tier === p.tier;
            return (
              <div
                key={p.id}
                className={`flex items-center justify-between rounded-2xl border p-4 transition ${
                  active
                    ? "border-green/50 bg-green/10"
                    : "border-white/10 bg-navy hover:border-white/20"
                }`}
              >
                <div>
                  <p className="text-sm font-bold text-soft">{p.name}</p>
                  <p className="mt-0.5 text-[11px] text-mist">
                    ${(p.minAmountCents / 100).toLocaleString()}
                    {p.maxAmountCents ? ` – $${(p.maxAmountCents / 100).toLocaleString()}` : "+"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-green">{formatBps(p.monthlyRateBps)} / mo</p>
                  <p className="text-[11px] text-mist">{formatBps(p.dailyRateBps)} / day</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer nav */}
      <div className="flex items-center justify-between pt-1">
        <Link href="/" className="inline-flex items-center gap-1 text-xs font-bold text-mist">
          <ChevronLeftIcon className="h-3.5 w-3.5" /> Dashboard
        </Link>
        <Link href="/invest/history" className="inline-flex items-center gap-1 text-xs font-bold text-green">
          <WalletIcon className="h-3.5 w-3.5" /> My investments
        </Link>
      </div>
    </div>
  );
}