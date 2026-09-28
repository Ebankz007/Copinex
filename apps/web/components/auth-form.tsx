"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, login, register, setPendingEnrollChallenge, verifyTwoFactor } from "@/lib/api";

type Mode = "login" | "register";

/**
 * Shared login/register form (light marketing design). Stores the token and
 * routes to the member dashboard on success. Register accepts a sponsor ID
 * prefilled from the ?sponsor= query parameter.
 *
 * Login is two-step when the account has 2FA: password first, then the
 * 6-digit authenticator (or backup) code against the returned challenge.
 */
export function AuthForm({
  mode,
  sponsorId: initialSponsor,
  notice,
}: {
  mode: Mode;
  sponsorId?: string;
  notice?: string;
}) {
  const router = useRouter();
  const isLogin = mode === "login";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [sponsorId, setSponsorId] = useState(initialSponsor ?? "");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (isLogin) {
        if (challenge) {
          await verifyTwoFactor(challenge, code);
        } else {
          const res = await login(email, password);
          if ("challenge" in res) {
            if ("requiresEnrollment" in res) {
              // Staff with no second factor enrolled: the password earned an
              // enrolment challenge, held in memory (never the URL), and the
              // enrol page completes setup before any session exists.
              setPendingEnrollChallenge(res.challenge);
              router.push("/enroll-2fa");
              setBusy(false);
              return;
            }
            // Password correct, second factor still owed — stay on this
            // page and ask for the authenticator code.
            setChallenge(res.challenge);
            setBusy(false);
            return;
          }
        }
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

  // Second step of a 2FA login: the challenge is held, only the code is owed.
  if (isLogin && challenge) {
    return (
      <form onSubmit={onSubmit} className="auth-stack">
        <p style={{ fontSize: 14, color: "var(--muted)" }}>
          Enter the 6-digit code from your authenticator app. Lost your device? Use one
          of your backup codes instead.
        </p>

        <div className="auth-field">
          <label htmlFor="code">Authentication code</label>
          <input
            id="code"
            type="text"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
          />
        </div>

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" disabled={busy} className="auth-submit">
          {busy ? "Verifying…" : "Verify and sign in"}
        </button>

        <p className="auth-foot">
          <button
            type="button"
            onClick={() => {
              setChallenge(null);
              setCode("");
              setError(null);
            }}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--blue-600)", fontWeight: 800, fontSize: 13 }}
          >
            ← Back to email and password
          </button>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="auth-stack">
      {notice && (
        <p
          role="status"
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--muted)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "10px 14px",
          }}
        >
          {notice}
        </p>
      )}
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