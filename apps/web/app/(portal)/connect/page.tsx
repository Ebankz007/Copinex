"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  LandmarkIcon,
  LinkIcon,
} from "@/components/icons";
import { ApiError, BrokerDto, fetchBrokers, fetchMe, requestPammConnection, type UserDto } from "@/lib/api";

const STEPS = [
  { title: "Choose a partner broker", note: null },
  { title: "Request PAMM connection", note: "Free â€” no processing fee" },
  { title: "Invest via the broker's private PAMM link", note: "Your funds stay with the broker" },
];

export default function ConnectPage() {
  const [brokers, setBrokers] = useState<BrokerDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<UserDto | null>(null);

  useEffect(() => {
    fetchMe().then(setMe);
    fetchBrokers()
      .then(setBrokers)
      .catch(() => setError("Could not load partner brokers. Try again."))
      .finally(() => setLoading(false));
  }, []);

  const notActivated = me !== null && !me.membershipActivated;

  async function handleSelect(broker: BrokerDto) {
    setError(null);
    setRequestingId(broker.id);
    try {
      const { redirectUrl } = await requestPammConnection(broker.id);
      // Redirect the client to the broker's private PAMM link â€” the
      // investment happens broker-side.
      window.location.href = redirectUrl;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setError("Please log in to request a PAMM connection.");
      } else if (e instanceof ApiError && e.code === "MEMBERSHIP_NOT_ACTIVATED") {
        setError("Pay the $50 activation fee to unlock PAMM connections.");
      } else if (e instanceof ApiError && e.code === "BROKER_INACTIVE") {
        setError("This broker is no longer accepting connections.");
      } else {
        setError("Could not submit the request. Try again.");
      }
      setRequestingId(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 pb-10 pt-6 sm:max-w-xl sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8 xl:max-w-7xl">
      {/* Header */}
      <header className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-soft transition hover:bg-white/10"
          aria-label="Back to dashboard"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold tracking-tight text-soft">Connect to PAMM</h1>
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
              {step.note && <p className="mt-1 text-sm text-mist">{step.note}</p>}
            </div>
          </div>
        ))}
      </section>

      {/* Error */}
      {error && (
        <p className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-soft">
          {error}
        </p>
      )}

      {/* Active Member policy: unactivated members see brokers but cannot connect. */}
      {notActivated && (
        <section className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3">
          <p className="text-sm font-bold text-amber-300">Activate your membership</p>
          <p className="mt-1 text-xs text-mist">
            PAMM connections unlock after you pay the one-time $50 activation fee. You are
            already earning commissions â€” contact your sponsor or support to activate.
          </p>
        </section>
      )}

      {/* Partner brokers */}
      <section className="mt-7">
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-mist">
          Partner Brokers
        </h2>
        <div className="mt-3 space-y-3">
          {loading && (
            <p className="py-6 text-center text-sm text-mist">Loading brokersâ€¦</p>
          )}
          {!loading && brokers.length === 0 && (
            <p className="py-6 text-center text-sm text-mist">
              No partner brokers available yet.
            </p>
          )}
          {brokers.map((broker) => (
            <button
              key={broker.id}
              type="button"
              disabled={requestingId !== null || notActivated}
              onClick={() => handleSelect(broker)}
              className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-navy p-4 text-left transition hover:border-green/30 hover:bg-navy-2 disabled:opacity-60"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-green to-teal-2 text-sm font-extrabold text-night">
                {broker.code}
              </span>
              <span className="flex-1">
                <span className="block text-[15px] font-bold text-soft">
                  {broker.name}
                </span>
                <span className="block text-xs text-mist">PAMM Partner</span>
              </span>
              {requestingId === broker.id ? (
                <span className="text-xs font-semibold text-green">Redirectingâ€¦</span>
              ) : (
                <ChevronRightIcon className="h-4 w-4 text-mist" />
              )}
            </button>
          ))}
        </div>
      </section>

      <p className="mt-8 flex items-center justify-center gap-2 text-center text-xs text-mist">
        <LinkIcon className="h-4 w-4 text-teal" />
        You invest directly with the broker through their private PAMM link.
      </p>
      <p className="mt-2 flex items-center justify-center gap-2 text-center text-xs text-mist">
        <LandmarkIcon className="h-4 w-4 text-teal" />
        Your funds stay with your broker. Copinex never holds your PAMM funds.
      </p>
    </main>
  );
}
