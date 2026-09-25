"use client";

import { useState } from "react";
import { InfoIcon } from "@/components/icons";

const PROCESSING_FEE = 1.0;

/**
 * Connect Account form — mirrors the reference screen exactly:
 * Full Legal Name + Amount Deposited with Broker, then a live fee summary
 * (Available Balance / Processing Fee / Balance After Fee) and CONNECT NOW.
 *
 * Wallet balance is $0.00 in this demo (no Copinex deposit yet); the summary
 * clamps at $0.00 to match the reference screenshot.
 */
export function ConnectForm() {
  const [legalName, setLegalName] = useState("");
  const [depositAmount, setDepositAmount] = useState("");

  const available = 0.0;
  const afterFee = Math.max(0, available - PROCESSING_FEE);

  return (
    <form
      className="mt-6 space-y-5"
      onSubmit={(e) => e.preventDefault()}
      noValidate
    >
      <div>
        <label htmlFor="legal-name" className="text-sm font-semibold text-soft">
          Full Legal Name
        </label>
        <input
          id="legal-name"
          type="text"
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
          placeholder="Enter your full legal name"
          autoComplete="name"
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-soft placeholder:text-mist focus:border-green focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="deposit-amount" className="text-sm font-semibold text-soft">
          Amount Deposited with Broker
        </label>
        <input
          id="deposit-amount"
          type="text"
          inputMode="decimal"
          value={depositAmount}
          onChange={(e) => setDepositAmount(e.target.value)}
          placeholder="Enter amount"
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-soft placeholder:text-mist focus:border-green focus:outline-none"
        />
        <p className="mt-2 text-xs text-mist">Recommended: $50</p>
        <p className="mt-1.5 inline-flex items-start gap-1.5 text-xs text-mist">
          <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This is informational only, your funds are with the broker.
        </p>
      </div>

      <div className="space-y-3 rounded-2xl border border-white/10 bg-navy p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-mist">Your Copinex Available Balance</span>
          <span className="font-semibold text-soft">${available.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-mist">Processing Fee</span>
          <span className="font-semibold text-soft">${PROCESSING_FEE.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-white/10 pt-3 text-sm">
          <span className="font-semibold text-soft">Balance After Fee</span>
          <span className="font-bold text-green">${afterFee.toFixed(2)}</span>
        </div>
      </div>

      <button
        type="submit"
        className="w-full rounded-2xl bg-green py-3.5 text-[15px] font-bold text-night transition hover:brightness-110 active:scale-[0.99]"
      >
        Connect Now
      </button>
      <p className="pb-2 text-center text-xs text-mist">$1 processing fee</p>
    </form>
  );
}