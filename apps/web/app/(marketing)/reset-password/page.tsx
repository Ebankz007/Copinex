import Link from "next/link";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata = {
  title: "Reset password — Copinex",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <Link href="/" className="wordmark" aria-label="Copinex home">
          <span className="wordmark-name">COPINEX</span>
          <span className="wordmark-note">Copy · Trade · Grow</span>
        </Link>
        <h1>Choose a new password</h1>
        {token ? (
          <p>Your reset link is valid. Set a new password to finish.</p>
        ) : (
          <>
            <p>
              This page needs a valid reset link. Request a new one from the forgot-password page —
              links are single-use and expire after one hour.
            </p>
            <div style={{ marginTop: 22 }}>
              <Link href="/forgot-password" className="auth-submit" style={{ display: "grid", placeItems: "center", textDecoration: "none" }}>
                Request a new link
              </Link>
            </div>
          </>
        )}
        {token && (
          <div style={{ marginTop: 24 }}>
            <ResetPasswordForm token={token} />
          </div>
        )}
      </div>
    </main>
  );
}