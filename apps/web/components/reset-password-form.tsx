"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, resetPassword } from "@/lib/api";
import { PasswordInput } from "@/components/password-input";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div>
        <p className="auth-success">Your password has been reset. You can sign in now.</p>
        <div style={{ marginTop: 18 }}>
          <Link href="/login" className="auth-submit" style={{ display: "grid", placeItems: "center", textDecoration: "none" }}>
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="auth-stack">
      <PasswordInput
        id="password"
        label="New password"
        value={password}
        onChange={setPassword}
        placeholder="At least 8 characters"
        autoComplete="new-password"
        minLength={8}
      />
      <PasswordInput
        id="confirm"
        label="Confirm password"
        value={confirm}
        onChange={setConfirm}
        placeholder="Repeat the password"
        autoComplete="new-password"
        minLength={8}
      />
      {error && <p className="auth-error">{error}</p>}
      <button type="submit" disabled={busy} className="auth-submit">
        {busy ? "Please wait…" : "Reset password"}
      </button>
    </form>
  );
}