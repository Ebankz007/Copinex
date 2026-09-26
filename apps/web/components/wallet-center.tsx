"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ApiError,
  createActivationPayment,
  createDepositPayment,
  fetchLedger,
  fetchMe,
  fetchMyPayments,
  fetchMyWithdrawals,
  fetchWalletBalances,
  isDemoMode,
  submitWithdrawal,
  type LedgerEntryDto,
  type PaymentDto,
  type UserDto,
  type WalletBalances,
  type WithdrawalRequestDto,
} from "@/lib/api";
import { formatCents, formatDate } from "@/lib/format";
import {
  ArrowUpRightIcon,
  ExternalLinkIcon,
  PlusIcon,
  ShieldCheckIcon,
  WalletIcon,
} from "@/components/icons";

type Tab = "deposit" | "withdraw" | null;

const PAYMENT_LABEL: Record<PaymentDto["purpose"], string> = {
  ACTIVATION: "Activation fee",
  DEPOSIT: "Deposit",
};

const STATUS_BADGE: Record<PaymentDto["status"], string> = {
  PENDING: "bg-amber-400/15 text-amber-300",
  PAID: "bg-green/15 text-green",
  EXPIRED: "bg-white/10 text-mist",
  FAILED: "bg-red-400/15 text-red-400",
};

export function WalletCenter({ initialTab }: { initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [me, setMe] = useState<UserDto | null>(null);
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [payments, setPayments] = useState<PaymentDto[]>([]);
  const [ledger, setLedger] = useState<LedgerEntryDto[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequestDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [depositText, setDepositText] = useState("100");
  const [withdrawWallet, setWithdrawWallet] = useState<"COPINEX" | "WITHDRAWAL">("WITHDRAWAL");
  const [withdrawText, setWithdrawText] = useState("");

  const demo = isDemoMode();
  const notActivated = !demo && me !== null && !me.membershipActivated;
  const pendingPayment = useMemo(
    () => payments.find((p) => p.status === "PENDING") ?? null,
    [payments],
  );

  const reload = useCallback(async () => {
    try {
      const [b, p, l, w] = await Promise.all([
        fetchWalletBalances(),
        fetchMyPayments(),
        fetchLedger(),
        fetchMyWithdrawals(),
      ]);
      setBalances(b);
      setPayments(p);
      setLedger(l);
      setWithdrawals(w);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "Could not load wallet data");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchMe().then((u) => {
      if (!cancelled) setMe(u);
    });
    if (demo) return;
    reload();
    return () => {
      cancelled = true;
    };
  }, [demo, reload]);

  // While a payment is PENDING, poll — the webhook flips it to PAID and the
  // page updates without a manual refresh.
  useEffect(() => {
    if (demo || !pendingPayment) return;
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
  }, [demo, pendingPayment, reload]);

  const copinexBalance = balances?.wallets.find((w) => w.walletType === "COPINEX")?.balanceCents ?? 0;
  const withdrawalBalance =
    balances?.wallets.find((w) => w.walletType === "WITHDRAWAL")?.balanceCents ?? 0;
  const holds = balances?.pendingHoldsCents ?? 0;

  async function handleActivate() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const payment = await createActivationPayment();
      await reload();
      setTab(null);
      setSuccess("Activation invoice created — complete the payment to unlock your membership.");
      if (payment.paymentUrl) window.open(payment.paymentUrl, "_blank", "noopener");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create activation invoice");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeposit() {
    const n = Number(depositText);
    const amountCents = Math.round(n * 100);
    if (!Number.isFinite(n) || amountCents < 100) {
      setError("Minimum deposit is $1");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const payment = await createDepositPayment(amountCents);
      await reload();
      setTab(null);
      setSuccess("Deposit invoice created — funds settle to your COPINEX wallet once confirmed.");
      if (payment.paymentUrl) window.open(payment.paymentUrl, "_blank", "noopener");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create deposit invoice");
    } finally {
      setBusy(false);
    }
  }

  async function handleWithdraw() {
    const n = Number(withdrawText);
    const amountCents = Math.round(n * 100);
    if (!Number.isFinite(n) || amountCents <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await submitWithdrawal(withdrawWallet, amountCents);
      await reload();
      setWithdrawText("");
      setTab(null);
      setSuccess("Withdrawal requested — funds are held and an admin will process the USDT payout.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Withdrawal failed — please try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {demo && (
        <p className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-xs text-amber-300">
          Demo mode — no account session.{" "}
          <Link href="/login" className="font-bold text-amber-200 underline underline-offset-2">
            Sign in
          </Link>{" "}
          to deposit, withdraw, and track your transactions.
        </p>
      )}

      {/* Balances */}
      <section className="rounded-3xl border border-white/10 bg-gradient-to-b from-navy-2 to-navy p-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist">
            Balances (USDT)
          </p>
          <WalletIcon className="h-4 w-4 text-green" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-mist">
              COPINEX Wallet
            </p>
            <p className="mt-1 text-xl font-bold text-soft">{formatCents(copinexBalance)}</p>
            <p className="mt-0.5 text-[10px] text-mist">Deposits & commissions</p>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-mist">
              Withdrawal Wallet
            </p>
            <p className="mt-1 text-xl font-bold text-soft">{formatCents(withdrawalBalance)}</p>
            <p className="mt-0.5 text-[10px] text-mist">Investment profits</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-mist">
          {holds > 0 ? (
            <>
              <span className="font-semibold text-amber-300">{formatCents(holds)}</span> held in
              pending withdrawals
            </>
          ) : (
            "No pending withdrawal holds"
          )}
        </p>
      </section>

      {/* Activation CTA */}
      {notActivated && (
        <section className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-5">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="h-5 w-5 text-amber-300" />
            <p className="text-sm font-bold text-soft">Activate your membership</p>
          </div>
          <p className="mt-2 text-xs text-mist">
            Pay the one-time <span className="font-semibold text-soft">$50 activation fee</span> to
            unlock withdrawals, investments, and PAMM. You are already earning commissions.
          </p>
          <button
            onClick={handleActivate}
            disabled={busy}
            className="mt-4 w-full rounded-2xl bg-green py-3 text-sm font-bold text-night transition hover:brightness-110 active:scale-[0.99] disabled:opacity-40"
          >
            {busy ? "Creating invoice…" : "Pay $50 Activation Fee"}
          </button>
        </section>
      )}

      {/* Deposit / Withdraw actions */}
      <section className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setTab(tab === "deposit" ? null : "deposit")}
          className="flex items-center justify-center gap-2 rounded-2xl bg-green py-3.5 text-sm font-bold text-night transition hover:brightness-110 active:scale-[0.99]"
        >
          <PlusIcon className="h-4 w-4" />
          Deposit
        </button>
        <button
          onClick={() => setTab(tab === "withdraw" ? null : "withdraw")}
          className="flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 py-3.5 text-sm font-bold text-soft transition hover:bg-white/10 active:scale-[0.99]"
        >
          <ArrowUpRightIcon className="h-4 w-4" />
          Withdraw
        </button>
      </section>

      {/* Deposit panel */}
      {tab === "deposit" && (
        <section className="rounded-3xl border border-white/10 bg-navy p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist">
            Deposit USDT (TRC20)
          </p>
          <p className="mt-1 text-xs text-mist">
            You will get a Pay2Crypto checkout link. Funds settle to your COPINEX wallet
            automatically once confirmed on-chain.
          </p>
          {notActivated ? (
            <p className="mt-4 rounded-2xl bg-amber-400/10 px-4 py-3 text-xs text-amber-300">
              Activate your membership first to unlock deposits.
            </p>
          ) : (
            <>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-green">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step={1}
                  value={depositText}
                  onChange={(e) => setDepositText(e.target.value)}
                  className="w-full bg-transparent text-[2rem] font-bold leading-none tracking-tight text-soft outline-none placeholder:text-muted"
                  placeholder="100"
                  aria-label="Deposit amount in USD"
                />
              </div>
              <button
                onClick={handleDeposit}
                disabled={busy || demo}
                className="mt-4 w-full rounded-2xl bg-green py-3 text-sm font-bold text-night transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Creating invoice…" : "Create Deposit Invoice"}
              </button>
            </>
          )}
        </section>
      )}

      {/* Withdraw panel */}
      {tab === "withdraw" && (
        <section className="rounded-3xl border border-white/10 bg-navy p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist">
            Withdraw USDT (TRC20)
          </p>
          <p className="mt-1 text-xs text-mist">
            Funds are held immediately; an admin processes the manual USDT payout and records the
            transaction hash.
          </p>
          {notActivated ? (
            <p className="mt-4 rounded-2xl bg-amber-400/10 px-4 py-3 text-xs text-amber-300">
              Activate your membership first to unlock withdrawals.
            </p>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(["WITHDRAWAL", "COPINEX"] as const).map((wt) => (
                  <button
                    key={wt}
                    onClick={() => setWithdrawWallet(wt)}
                    className={`rounded-2xl border px-3 py-2.5 text-xs font-bold transition ${
                      withdrawWallet === wt
                        ? "border-green/50 bg-green/10 text-green"
                        : "border-white/10 bg-white/5 text-mist hover:border-white/20"
                    }`}
                  >
                    {wt === "WITHDRAWAL" ? "Withdrawal Wallet" : "COPINEX Wallet"}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-green">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step={1}
                  value={withdrawText}
                  onChange={(e) => setWithdrawText(e.target.value)}
                  className="w-full bg-transparent text-[2rem] font-bold leading-none tracking-tight text-soft outline-none placeholder:text-muted"
                  placeholder="0"
                  aria-label="Withdrawal amount in USD"
                />
              </div>
              <button
                onClick={handleWithdraw}
                disabled={busy || demo}
                className="mt-4 w-full rounded-2xl bg-green py-3 text-sm font-bold text-night transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Submitting…" : "Request Withdrawal"}
              </button>
            </>
          )}
        </section>
      )}

      {/* Pending payment banner */}
      {pendingPayment && (
        <section className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-5">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="h-5 w-5 text-amber-300" />
            <p className="text-sm font-bold text-soft">Payment awaiting confirmation</p>
          </div>
          <p className="mt-2 text-xs text-mist">
            {PAYMENT_LABEL[pendingPayment.purpose]} of{" "}
            <span className="font-semibold text-soft">{formatCents(pendingPayment.amountCents)}</span>{" "}
            is pending on-chain confirmation. This page updates automatically once it clears.
          </p>
          {pendingPayment.paymentUrl && (
            <a
              href={pendingPayment.paymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-2xl bg-green px-4 py-2.5 text-xs font-bold text-night transition hover:brightness-110"
            >
              <ExternalLinkIcon className="h-3.5 w-3.5" />
              Open checkout
            </a>
          )}
        </section>
      )}

      {error && <p className="text-center text-xs font-medium text-red-400">{error}</p>}
      {success && <p className="text-center text-xs font-medium text-green">{success}</p>}

      {/* Payments (crypto rail) */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist">Payments</p>
        {payments.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-white/5 bg-navy px-4 py-5 text-center text-xs text-mist">
            No payments yet.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-navy p-4"
              >
                <div>
                  <p className="text-sm font-bold text-soft">{PAYMENT_LABEL[p.purpose]}</p>
                  <p className="mt-0.5 text-[11px] text-mist">{formatDate(p.createdAt)}</p>
                  {p.txHash && (
                    <p className="mt-0.5 max-w-[200px] truncate text-[10px] text-mist">
                      {p.txHash}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-soft">{formatCents(p.amountCents)}</p>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${STATUS_BADGE[p.status]}`}
                  >
                    {p.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Ledger activity */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist">Activity</p>
        {ledger.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-white/5 bg-navy px-4 py-5 text-center text-xs text-mist">
            No activity yet.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {ledger.slice(0, 15).map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-navy p-4"
              >
                <div>
                  <p className="text-sm font-bold text-soft">
                    {e.type.replace(/_/g, " ")} · {e.walletType}
                  </p>
                  <p className="mt-0.5 text-[11px] text-mist">{formatDate(e.createdAt)}</p>
                </div>
                <p
                  className={`text-sm font-bold ${
                    e.amountCents >= 0 ? "text-green" : "text-red-400"
                  }`}
                >
                  {e.amountCents >= 0 ? "+" : ""}
                  {formatCents(e.amountCents)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Withdrawal requests */}
      {withdrawals.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist">
            Withdrawal requests
          </p>
          <div className="mt-3 space-y-2">
            {withdrawals.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-navy p-4"
              >
                <div>
                  <p className="text-sm font-bold text-soft">{formatCents(w.amountCents)}</p>
                  <p className="mt-0.5 text-[11px] text-mist">
                    {w.walletType} · {formatDate(w.createdAt)}
                    {w.payoutTxid ? ` · ${w.payoutTxid.slice(0, 12)}…` : ""}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    w.status === "PAID"
                      ? "bg-green/15 text-green"
                      : w.status === "REJECTED"
                        ? "bg-red-400/15 text-red-400"
                        : "bg-amber-400/15 text-amber-300"
                  }`}
                >
                  {w.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {loadError && (
        <p className="rounded-2xl bg-red-400/10 px-4 py-3 text-center text-xs text-red-400">
          {loadError}
          <button onClick={reload} className="ml-2 font-bold underline underline-offset-2">
            Retry
          </button>
        </p>
      )}

      <div className="flex items-center justify-between pt-1">
        <Link href="/" className="inline-flex items-center gap-1 text-xs font-bold text-mist">
          Dashboard
        </Link>
        <Link href="/invest" className="inline-flex items-center gap-1 text-xs font-bold text-green">
          Invest & earn daily
        </Link>
      </div>
    </div>
  );
}