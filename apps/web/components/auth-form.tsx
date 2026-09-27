"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, login, register } from "@/lib/api";

type Mode = "login" | "register";

/**
 * Shared login/register form (light marketing design). Stores the token and
 * routes to the member dashboard on success. Register accepts a sponsor ID
 * prefilled from the ?sponsor= query parameter.
 */
export function AuthForm({ mode, sponsorId: initialSponsor }: { mode: Mode; sponsorId?: string }) {
  const router = useRouter();
  const isLogin = mode === "login";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [sponsorId, setSponsorId] = useState(initialSponsor ?? "");
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
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="auth-stack">
      {!isLogin && (
        <div className="auth-field">
          <label htmlFor="fullName">Full name <span style={{ fontWeight: 500, color: "var(--muted)" }}>(optional)</span></label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
          />
        </div>
      )}

      <div className="auth-field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>

      <div className="auth-field">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <label htmlFor="password">Password</label>
          {isLogin && (
            <Link
              href="/forgot-password"
              style={{ fontSize: 12, fontWeight: 800, color: "var(--blue-600)" }}
            >
              Forgot password?
            </Link>
          )}
        </div>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete={isLogin ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
        />
      </div>

      {!isLogin && (
        <div className="auth-field">
          <label htmlFor="sponsorId">Sponsor ID <span style={{ fontWeight: 500, color: "var(--muted)" }}>(optional)</span></label>
          <input
            id="sponsorId"
            type="text"
            value={sponsorId}
            onChange={(e) => setSponsorId(e.target.value)}
            placeholder="Paste your sponsor's ID"
          />
        </div>
      )}

      {error && <p className="auth-error">{error}</p>}

      <button type="submit" disabled={busy} className="auth-submit">
        {busy ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
      </button>

      <p className="auth-foot">
        {isLogin ? (
          <>
            No account yet?{" "}
            <Link href="/register">
              Register
            </Link>
          </>
        ) : (
          <>
            Already registered?{" "}
            <Link href="/login">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}