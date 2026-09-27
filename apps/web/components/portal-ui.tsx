"use client";

import Link from "next/link";
import { ChevronLeftIcon } from "@/components/icons";

/**
 * Dark portal page frame — matches the existing member pages (max-w-md column,
 * back link, page title). Every portal route renders inside this.
 */
export function PortalPage({
  title,
  backHref = "/dashboard",
  backLabel = "Back to dashboard",
  children,
}: {
  title: string;
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-10 pt-6">
      <header className="flex items-center gap-3">
        <Link
          href={backHref}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-soft transition hover:bg-white/10"
          aria-label={backLabel}
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold tracking-tight text-soft">{title}</h1>
      </header>
      {children}
    </main>
  );
}

/** Card surface used across the portal and admin console. */
export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-3xl border border-white/10 bg-navy p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3">
          {title && (
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist">{title}</p>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Inline status / error line. */
export function Note({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "ok";
  children: React.ReactNode;
}) {
  const tones = {
    info: "border-white/10 bg-white/5 text-mist",
    error: "border-red-400/30 bg-red-400/10 text-soft",
    ok: "border-green/30 bg-green/10 text-green",
  } as const;
  return (
    <p className={`rounded-2xl border px-4 py-3 text-sm ${tones[tone]}`}>{children}</p>
  );
}

/** Primary action button (green) and quiet secondary. */
export function ActionButton({
  children,
  onClick,
  disabled,
  tone = "primary",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "primary" | "quiet" | "danger";
  type?: "button" | "submit";
}) {
  const tones = {
    primary: "bg-green text-night hover:brightness-110",
    quiet: "border border-white/15 bg-white/5 text-soft hover:bg-white/10",
    danger: "border border-red-400/40 bg-red-400/10 text-red-300 hover:bg-red-400/20",
  } as const;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-bold transition active:scale-[0.99] disabled:opacity-50 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

/** Labelled input row. */
export function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-mist">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-night-2 px-4 py-3 text-[15px] text-soft outline-none transition focus:border-green/50"
      />
    </label>
  );
}
