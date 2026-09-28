"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import {
  ApiError,
  enrollEnable,
  enrollSetup,
  takePendingEnrollChallenge,
} from "@/lib/api";

/**
 * Mandatory staff 2FA enrolment. Reached only via a password login that
 * answered requiresEnrollment: the challenge lives in memory (never the
 * URL), opens only the setup/enable endpoints, and proving possession mints
 * the first session directly — no second login round-trip.
 */
export default function Enroll2faPage() {
  const router = useRouter();
  const [challenge] = useState<string | null>(() => takePendingEnrollChallenge());
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [manualKey, setManualKey] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!challenge) return;
    let cancelled = false;
    enrollSetup(challenge)
      .then(async (setup) => {
        if (cancelled) return;
        setManualKey(setup.manualKey);
        setQrUrl(await QRCode.toDataURL(setup.otpauthUrl));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Setup failed. Sign in again.");
      });
    return () => {
      cancelled = true;
    };
  }, [challenge]);

  async function onConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    setError(null);
    setBusy(true);
    try {
      const res = await enrollEnable(challenge, code);
      setBackupCodes(res.backupCodes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That code did not verify.");
    } finally {
      setBusy(false);
    }
  }

  function onDone() {
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <Link href="/" className="wordmark" aria-label="Copinex home">
          <span className="wordmark-name">COPINEX</span>
          <span className="wordmark-note">Copy · Trade · Grow</span>
        </Link>
        <h1>Secure your staff account</h1>

        {!challenge && (
          <>
            <p>This page is reached through sign-in. Staff accounts must enrol a second factor first.</p>
            <div style={{ marginTop: 24 }}>
              <Link href="/login" className="auth-submit" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
                Back to sign in
              </Link>
            </div>
          </>
        )}

        {challenge && !backupCodes && (
          <>
            <p>
              Staff sign-in requires two-factor authentication. Scan the code
              into your authenticator app, then enter the 6-digit code it shows.
            </p>
            {error && <p className="auth-error">{error}</p>}
            {qrUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrUrl}
                alt="QR code to scan into your authenticator app"
                style={{ width: 192, height: 192, margin: "16px auto 0", display: "block", background: "#fff", padding: 8, borderRadius: 12 }}
              />
            )}
            {manualKey && (
              <p style={{ marginTop: 12, fontSize: 13, wordBreak: "break-all", textAlign: "center", fontFamily: "monospace" }}>
                {manualKey}
              </p>
            )}
            <form onSubmit={onConfirm} className="auth-stack" style={{ marginTop: 16 }}>
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
              <button type="submit" disabled={busy} className="auth-submit">
                {busy ? "Verifying…" : "Confirm and sign in"}
              </button>
            </form>
          </>
        )}

        {challenge && backupCodes && (
          <>
            <p>
              Two-factor authentication is on. Save these backup codes somewhere
              safe — each works once, and this is the only time they are shown.
            </p>
            <ul style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, listStyle: "none", padding: 0 }}>
              {backupCodes.map((c) => (
                <li key={c} style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 14, textAlign: "center", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 4px" }}>
                  {c}
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 24 }}>
              <button onClick={onDone} className="auth-submit" style={{ width: "100%" }}>
                I have saved my codes — continue
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
