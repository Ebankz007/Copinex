"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, resendVerification, verifyEmail } from "@/lib/api";

export function VerifyEmailPanel({ token }: { token?: string }) {
  const router = useRouter();
  const [state, setState] = useState<"working" | "done" | "error" | "idle">(
    token ? "working" : "idle",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    verifyEmail(token)
      .then(() => {
        if (!cancelled) {
          setState("done");
          setTimeout(() => router.push("/dashboard"), 1200);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState("error");
          setMessage(err instanceof ApiError ? err.message : "Verification failed.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  async function onResend() {
    setSent(false);
    try {
      const result = await resendVerification();
      setSent(true);
      if (result.link) setMessage(`Dev link: ${result.link}`);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not resend.");
    }
  }

  return (
    <div>
      {state === "working" && <p className="auth-success">Verifying your email…</p>}

      {state === "done" && (
        <p className="auth-success">
          Email verified. Taking you to your dashboard…
        </p>
      )}

      {state === "error" && (
        <>
          <p className="auth-error">{message ?? "This link is invalid or has expired."}</p>
          <button type="button" className="auth-submit" style={{ marginTop: 14 }} onClick={onResend}>
            Resend verification email
          </button>
          {sent && <p className="auth-success" style={{ marginTop: 12 }}>Verification email sent.</p>}
        </>
      )}

      {state === "idle" && (
        <>
          <p className="auth-success">
            Your account is active. Verify your email to secure account recovery.
          </p>
          <button type="button" className="auth-submit" style={{ marginTop: 14 }} onClick={onResend}>
            Send verification email
          </button>
          {sent && <p className="auth-success" style={{ marginTop: 12 }}>Verification email sent.</p>}
        </>
      )}

      <p className="auth-foot" style={{ marginTop: 18 }}>
        <Link href="/dashboard">Continue to your dashboard</Link>
      </p>
    </div>
  );
}