"use client";

import { useState } from "react";
import Link from "next/link";

const NAV = [
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#technology", label: "Technology" },
  { href: "/#safety", label: "Safety & Control" },
  { href: "/#community", label: "Community" },
  { href: "/faq", label: "FAQ" },
];

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** Sticky marketing header with the mobile menu (client-side toggle). */
export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="site-header">
        <div className="shell header-inner">
          <Link href="/" className="wordmark" aria-label="Copinex home">
            <span className="wordmark-name">COPINEX</span>
            <span className="wordmark-note">Copy · Trade · Grow</span>
          </Link>
          <nav className="desktop-nav" aria-label="Primary navigation">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="btn btn-dark">
              Sign in
            </Link>
            <Link href="/register" className="btn">
              Get started <ArrowIcon />
            </Link>
          </div>
          <button
            className="btn btn-dark !min-h-0 !px-3 !py-2 lg:hidden"
            type="button"
            aria-label="Open navigation"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="!h-5 !w-5">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <button
            className="absolute inset-0 bg-[rgba(3,19,35,0.58)]"
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-0 right-0 flex h-full w-[min(88vw,380px)] flex-col bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-4">
              <span className="wordmark-name">COPINEX</span>
              <button
                className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--line)] bg-white text-[var(--navy-950)]"
                type="button"
                aria-label="Close navigation"
                onClick={() => setOpen(false)}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <nav className="mt-4 grid" aria-label="Mobile navigation">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-[52px] items-center border-b border-[var(--line)] text-[17px] font-bold text-[var(--navy-950)]"
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href="/register"
                onClick={() => setOpen(false)}
                className="mt-5 flex min-h-[52px] items-center justify-center rounded-lg bg-[var(--brand-green)] font-extrabold text-[var(--brand-navy)]"
              >
                Get started
              </Link>
            </nav>
            <p className="mt-5 rounded-xl bg-[var(--soft)] p-4 text-sm leading-relaxed text-[var(--muted)]">
              Forex and CFD trading involves substantial risk and may result in loss.
            </p>
          </div>
        </div>
      )}
    </>
  );
}