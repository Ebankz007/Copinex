"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CopyTradeIcon, LinkIcon, UsersIcon } from "@/components/icons";
import { fetchMe, isDemoMode, type UserDto } from "@/lib/api";

/**
 * Network center: the member's referral link + how the compensation plan pays.
 * Referral link routes to /register?sponsor=<id>, which prefills the sponsor.
 */
export function NetworkCenter() {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(isDemoMode() ? false : true);
    fetchMe().then((u) => {
      if (!cancelled) {
        setUser(u);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const referralLink =
    typeof window !== "undefined" && user
      ? `${window.location.origin}/register?sponsor=${user.id}`
      : null;

  async function copyLink() {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — select the input instead.
      const el = document.getElementById("referral-link") as HTMLInputElement | null;
      el?.select();
    }
  }

  if (loaded && !user) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-10 pt-6">
        <header className="flex items-center gap-3">
          <Link
            href="/"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-soft transition hover:bg-white/10"
            aria-label="Back to dashboard"
          >
            <span className="text-lg">←</span>
          </Link>
          <h1 className="text-lg font-bold tracking-tight text-soft">Network</h1>
        </header>
        <section className="mt-8 rounded-3xl border border-white/10 bg-navy p-6 text-center">
          <UsersIcon className="mx-auto h-8 w-8 text-green" />
          <p className="mt-3 text-[15px] font-bold text-soft">Sign in to get your referral link</p>
          <p className="mt-1 text-sm text-mist">
            Your link earns you $15 per referral plus generation bonuses.
          </p>
          <Link
            href="/login"
            className="mt-5 inline-flex rounded-2xl bg-green px-6 py-3 text-sm font-bold text-night transition hover:brightness-110"
          >
            Sign in
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-10 pt-6">
      <header className="flex items-center gap-3">
        <Link
          href="/"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-soft transition hover:bg-white/10"
          aria-label="Back to dashboard"
        >
          <span className="text-lg">←</span>
        </Link>
        <h1 className="text-lg font-bold tracking-tight text-soft">Network</h1>
      </header>

      {/* Referral link */}
      <section className="mt-6 rounded-3xl border border-white/10 bg-navy p-5">
        <div className="flex items-center gap-2">
          <LinkIcon className="h-4 w-4 text-green" />
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-mist">
            Your Referral Link
          </h2>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <input
            id="referral-link"
            readOnly
            value={referralLink ?? "…"}
            onFocus={(e) => e.target.select()}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-soft focus:border-green focus:outline-none"
          />
          <button
            type="button"
            onClick={copyLink}
            className="shrink-0 rounded-xl bg-green px-4 py-3 text-xs font-bold text-night transition hover:brightness-110 active:scale-[0.98]"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
        <p className="mt-3 text-xs text-mist">
          Share this link — anyone who registers through it becomes your direct referral.
        </p>
        {user?.sponsorId && (
          <p className="mt-3 rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-xs text-mist">
            Your sponsor ID:{" "}
            <span className="font-bold text-soft">{user.sponsorId.slice(0, 8).toUpperCase()}</span>
          </p>
        )}
      </section>

      {/* How you earn */}
      <section className="mt-6 rounded-3xl border border-white/10 bg-navy p-5">
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-mist">
          How you earn
        </h2>
        <ul className="mt-4 space-y-3 text-sm">
          <li className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-green/15 text-[11px] font-extrabold text-green">
              $15
            </span>
            <span className="text-mist">
              <span className="font-bold text-soft">Direct referral bonus</span> — every person who
              joins through your link.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-teal-2/15 text-[11px] font-extrabold text-teal-2">
              G2–G6
            </span>
            <span className="text-mist">
              <span className="font-bold text-soft">Generation bonuses</span> — paid on your
              downline&apos;s registrations, 5 levels deep.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-green/15 text-[11px] font-extrabold text-green">
              10%
            </span>
            <span className="text-mist">
              <span className="font-bold text-soft">Sponsor share</span> — of your referral&apos;s
              trading profits, settled monthly.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-teal-2/15 text-[11px] font-extrabold text-teal-2">
              20%
            </span>
            <span className="text-mist">
              <span className="font-bold text-soft">Upline commission</span> — of your
              referral&apos;s investment profit, split across 6 upline levels.
            </span>
          </li>
        </ul>
      </section>

      {/* CTA */}
      <Link
        href="/connect"
        className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-green py-3.5 text-[15px] font-bold text-night transition hover:brightness-110 active:scale-[0.99]"
      >
        <CopyTradeIcon className="h-5 w-5" />
        Copy Trade with your network
      </Link>

      <footer className="mt-9 text-center">
        <p className="text-xs text-mist">Every account earns — no activation required to receive commissions.</p>
      </footer>
    </main>
  );
}