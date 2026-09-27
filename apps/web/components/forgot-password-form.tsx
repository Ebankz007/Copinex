"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError, forgotPassword } from "@/lib/api";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div>
        <p className="auth-success">
          If an account exists for <strong>{email}</strong>, a password-reset link is on its way.
          The link expires in one hour.
        </p>
        <p className="auth-foot" style={{ marginTop: 18 }}>
          <Link href="/login">Back to sign in</Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="auth-stack">
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
      {error && <p className="auth-error">{error}</p>}
      <button type="submit" disabled={busy} className="auth-submit">
        {busy ? "Please wait…" : "Send reset link"}
      </button>
      <p className="auth-foot">
        Remembered it?{" "}
        <Link href="/login">Sign in</Link>
      </p>
    </form>
  );
}