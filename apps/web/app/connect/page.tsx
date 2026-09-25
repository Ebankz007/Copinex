import Link from "next/link";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  LandmarkIcon,
  WalletIcon,
} from "@/components/icons";

const STEPS = [
  { title: "Choose a partner broker", note: null },
  { title: "Register, verify & deposit", note: "Minimum $50 recommended" },
  { title: "Return & link your account to the Master Trader", note: null },
  { title: "Pay $1 processing fee from your Copinex wallet", note: null },
];

const BROKERS = [
  { code: "PU", name: "PUPRIME", tagline: "Partner Broker" },
  { code: "DV", name: "DERIV", tagline: "Partner Broker" },
];

export default function ConnectPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-10 pt-6">
      {/* Header */}
      <header className="flex items-center gap-3">
        <Link
          href="/"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-soft transition hover:bg-white/10"
          aria-label="Back to dashboard"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold tracking-tight text-soft">How to Connect</h1>
      </header>

      {/* Steps */}
      <section className="mt-6 space-y-0">
        {STEPS.map((step, i) => (
          <div key={step.title} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  i === STEPS.length - 1
                    ? "bg-green text-night"
                    : "border border-green/40 bg-green/10 text-green"
                }`}
              >
                {i + 1}
              </span>
              {i < STEPS.length - 1 && (
                <span className="my-1 w-px flex-1 bg-white/10" aria-hidden="true" />
              )}
            </div>
            <div className="pb-6">
              <p className="text-[15px] font-semibold leading-snug text-soft">
                {step.title}
              </p>
              {step.note && (
                <p className="mt-1 text-sm text-mist">{step.note}</p>
              )}
            </div>
          </div>
        ))}
      </section>

      {/* Fee card */}
      <section className="mt-2 rounded-3xl border border-white/10 bg-navy p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist">
              Available Balance
            </p>
            <p className="mt-1.5 text-2xl font-bold text-soft">$0.00</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-green/10 text-green">
            <WalletIcon className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
          <p className="text-sm font-semibold text-soft">$1 Processing Fee</p>
          <span className="rounded-full bg-green/15 px-3 py-1 text-[11px] font-semibold text-green">
            Required for Connection
          </span>
        </div>
      </section>

      {/* Partner brokers */}
      <section className="mt-7">
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-mist">
          Partner Brokers
        </h2>
        <div className="mt-3 space-y-3">
          {BROKERS.map((broker) => (
            <Link
              key={broker.name}
              href="/connect/steps"
              className="flex items-center gap-4 rounded-2xl border border-white/10 bg-navy p-4 transition hover:border-green/30 hover:bg-navy-2"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-green to-teal-2 text-sm font-extrabold text-night">
                {broker.code}
              </span>
              <span className="flex-1">
                <span className="block text-[15px] font-bold text-soft">
                  {broker.name}
                </span>
                <span className="block text-xs text-mist">{broker.tagline}</span>
              </span>
              <ChevronRightIcon className="h-4 w-4 text-mist" />
            </Link>
          ))}
        </div>
      </section>

      <p className="mt-8 flex items-center justify-center gap-2 text-center text-xs text-mist">
        <LandmarkIcon className="h-4 w-4 text-teal" />
        Your funds stay with your broker. Copinex only copies the Master Trader.
      </p>
    </main>
  );
}