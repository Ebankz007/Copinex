"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, login, register } from "@/lib/api";

type Mode = "login" | "register";

/**
 * Shared login/register form. Stores the token (localStorage) and routes to
 * the dashboard on success.
 */
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const isLogin = mode === "login";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [sponsorId, setSponsorId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register({
          email,
          password,
          fullName: fullName.trim() || undefined,
          sponsorId: sponsorId.trim() || undefined,
        });
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-soft placeholder:text-mist/60 outline-none transition focus:border-green/50 focus:bg-white/[0.07]";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {!isLogin && (
        <div>
          <label htmlFor="fullName" className="mb-1.5 block text-xs font-semibold text-mist">
            Full name <span className="font-normal text-mist/60">(optional)</span>
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClass}
            placeholder="Jane Doe"
          />
        </div>
      )}

      <div>
        <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-mist">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-mist">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete={isLogin ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          placeholder="At least 8 characters"
        />
      </div>

      {!isLogin && (
        <div>
          <label htmlFor="sponsorId" className="mb-1.5 block text-xs font-semibold text-mist">
            Sponsor ID <span className="font-normal text-mist/60">(optional)</span>
          </label>
          <input
            id="sponsorId"
            type="text"
            value={sponsorId}
            onChange={(e) => setSponsorId(e.target.value)}
            className={inputClass}
            placeholder="Paste your sponsor's ID"
          />
        </div>
      )}

      {error && (
        <p className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-xs text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-2xl bg-green py-3.5 text-sm font-bold text-night transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
      >
        {busy ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
      </button>

      <p className="text-center text-xs text-mist">
        {isLogin ? (
          <>
            No account yet?{" "}
            <Link href="/register" className="font-bold text-green">
              Register
            </Link>
          </>
        ) : (
          <>
            Already registered?{" "}
            <Link href="/login" className="font-bold text-green">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}